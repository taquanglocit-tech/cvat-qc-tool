// bridge-main.js - Plugin cầu nối chạy trong ngữ cảnh trang (world: MAIN)
// Đăng ký trực tiếp với window.cvatUI của CVAT
// Trực tiếp can thiệp màu sắc trên Three.js Canvas và đồng bộ trạng thái Redux 0ms delay

(() => {
  if (window.__cvat3DQCBridge) return;
  window.__cvat3DQCBridge = true;

  const REQ = 'cvat-qc:req';
  const RES = 'cvat-qc:res';
  const EVT = 'cvat-qc:evt';

  let ctx = null; // { core, store, dispatch, actionCreators }
  let storeUnsubscribe = null;
  let lastCreatedClientId = null;
  let lastKnownCuboidIds = new Set();

  // Cài đặt mặc định của QC
  let qcSettings = {
    enabled: true,
    outerThreshold: 0.15,   // Ngưỡng lọt ngoài hoàn toàn d (m)
    pointSize: 1.0,         // Hệ số kích thước hạt Point cho công thức QC (mặc định 1.0x theo guideline CVAT)
    basePointRadius: 0.015, // Nửa kích thước hạt vuông 3x3cm tại 1.0x (1.5cm = 0.015m)
    filterGround: true,     // Bật bộ lọc mặt đất / mặt đáy hộp
    bottomTolerance: 0.05,  // Dung sai đáy hộp (5cm = 0.05m)
    highlightMissed: true,  // Tô màu điểm lọt ngoài hoàn toàn (Cam Neon)
    highlightBoundary: true,// Tô màu điểm bị lòi quá nửa ra ngoài (Xanh Lơ)
    highlightInnerEdge: true,// Tô màu điểm mép trong mấp mé sát vách (Vàng Chanh)
    highlightOverlap: true, // Tô màu & vẽ wireframe chồng lấn
    activeOnly: true,       // Soi điểm theo box đang chọn (hoặc tất cả các box)
  };

  // Màu sắc cảnh báo (RGB [0..1])
  const COLOR_MISSED = [1.0, 0.48, 0.0];      // Cam Neon (#FF7A00) - Lọt ngoài hẳn
  const COLOR_BOUNDARY = [0.0, 0.85, 0.95];   // Xanh Lơ Cyan (#00D9F2) - Tâm ngoài lòi quá bán
  const COLOR_INNER_EDGE = [1.0, 0.90, 0.0];  // Vàng Chanh (#FFE600) - Tâm trong chớm chạm mép

  function emitEvt(payload) {
    document.dispatchEvent(new CustomEvent(EVT, { detail: JSON.stringify(payload) }));
  }

  function emitRes(id, result, error = null) {
    document.dispatchEvent(new CustomEvent(RES, {
      detail: JSON.stringify({ id, result, error: error ? String(error.message || error) : null }),
    }));
  }

  // Chuyển đổi góc Euler (XYZ radian) sang 3 trục cơ sở chuẩn Three.js
  function eulerToAxes(r) {
    const rx = r[0], ry = r[1], rz = r[2];
    const a = Math.cos(rx), b = Math.sin(rx);
    const c = Math.cos(ry), d = Math.sin(ry);
    const e = Math.cos(rz), f = Math.sin(rz);

    const ce = c * e;
    const cf = c * f;
    const de = d * e;
    const df = d * f;

    return {
      ex: [ce, a * f + b * de, b * f - a * de],
      ey: [-cf, a * e - b * df, b * e + a * df],
      ez: [d, -b * c, a * c],
    };
  }

  // Hàm khoảng cách có dấu (SDF) từ điểm tới hộp
  function boxSDF(lx, ly, lz, hx, hy, hz) {
    const qx = Math.abs(lx) - hx;
    const qy = Math.abs(ly) - hy;
    const qz = Math.abs(lz) - hz;

    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    const outsideDist = Math.sqrt(ox * ox + oy * oy + oz * oz);

    const insideDist = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
    return outsideDist + insideDist;
  }

  // Lấy chế độ tô màu hiện tại của CVAT ('Label' | 'Instance' | 'Group')
  function getCvatColorBy() {
    try {
      const st = ctx?.store?.getState?.()?.annotation;
      return st?.canvas?.colorBy || st?.settings?.shapes?.colorBy || 'Label';
    } catch {
      return 'Label';
    }
  }

  // Tìm đối tượng Three.js Points và Scene của CVAT
  function getCanvasAndScene() {
    if (!ctx) return null;
    const canvasInstance = ctx.store?.getState?.()?.annotation?.canvas?.instance;
    if (!canvasInstance) return null;

    const doms = typeof canvasInstance.html === 'function' ? canvasInstance.html() : null;
    const views = canvasInstance.view?.views || canvasInstance.views || null;
    const scene = doms?.perspective?.scene || views?.perspective?.scene || null;
    if (!scene) return null;

    let cloudObj = null;
    scene.traverse((obj) => {
      if (obj.isPoints && obj.name !== 'cvat_qc_ghost_group' && !obj.name.startsWith('cvat_super_pro')) {
        cloudObj = obj;
      }
    });

    return { canvasInstance, doms, views, scene, cloudObj };
  }

  // Xóa nhóm wireframe overlap cũ trong Three.js scene
  function clearOverlapVisuals(scene) {
    if (!scene) return;
    const old = scene.getObjectByName('cvat_qc_overlap_group');
    if (old) {
      scene.remove(old);
      old.traverse?.((c) => {
        c.geometry?.dispose?.();
        c.material?.dispose?.();
      });
    }
  }

  // Trích xuất các hàm tạo Three.js trực tiếp từ scene của CVAT (không phụ thuộc window.THREE)
  function getThreeConstructors(scene, cloudObj) {
    if (window.THREE && window.THREE.BufferGeometry && window.THREE.LineSegments) {
      return window.THREE;
    }

    let BufferGeometry = cloudObj?.geometry?.constructor;
    let BufferAttribute = cloudObj?.geometry?.attributes?.position?.constructor;
    let LineSegments = null;
    let LineBasicMaterial = null;
    let Group = scene?.children?.[0]?.constructor?.__proto__ || scene?.constructor;

    if (scene) {
      scene.traverse((obj) => {
        if (obj.isLineSegments && !LineSegments) {
          LineSegments = obj.constructor;
          if (obj.material) LineBasicMaterial = obj.material.constructor;
        }
      });

      if (!LineSegments && scene.children) {
        const helper = scene.children.find((c) => c && c.isLineSegments);
        if (helper) {
          LineSegments = helper.constructor;
          if (helper.material) LineBasicMaterial = helper.material.constructor;
        }
      }
    }

    return {
      BufferGeometry,
      BufferAttribute,
      LineSegments,
      LineBasicMaterial,
      Group,
    };
  }

  // Áp dụng thuật toán phân loại điểm và đổi màu trực tiếp trên mảng Float32Array của Three.js
  function applyPointColorsAndQC() {
    const info = getCanvasAndScene();
    if (!info || !info.cloudObj) return null;

    const { canvasInstance, doms, scene, cloudObj } = info;
    const geom = cloudObj.geometry;
    if (!geom || !geom.attributes?.position) return null;

    const posAttr = geom.attributes.position;
    let colAttr = geom.attributes.color;

    // Nếu Cloud chưa có attribute color, tạo mới với màu trắng mặc định
    if (!colAttr) {
      const defaultColors = new Float32Array(posAttr.count * 3);
      defaultColors.fill(1.0);
      geom.setAttribute('color', new (posAttr.constructor)(defaultColors, 3));
      colAttr = geom.attributes.color;
      if (cloudObj.material) {
        cloudObj.material.vertexColors = true;
        cloudObj.material.needsUpdate = true;
      }
    }

    const currentFrame = ctx.store.getState()?.annotation?.player?.frame?.number ?? 0;

    // Lưu bản sao màu gốc khi frame mới được nạp
    if (!cloudObj.userData.__qcOriginalColors || cloudObj.userData.__qcFrame !== currentFrame) {
      cloudObj.userData.__qcOriginalColors = new Float32Array(colAttr.array);
      cloudObj.userData.__qcFrame = currentFrame;
    }

    const origCols = cloudObj.userData.__qcOriginalColors;
    const colArr = colAttr.array;
    const posArr = posAttr.array;
    const pointCount = posAttr.count;

    // 1. Khôi phục lại màu gốc
    colArr.set(origCols);
    clearOverlapVisuals(scene);

    if (!qcSettings.enabled) {
      colAttr.needsUpdate = true;
      canvasInstance.render?.();
      return { inside: 0, boundary: 0, nearMissed: 0, overlaps: [] };
    }

    // 2. Lấy danh sách các Cuboid ở frame hiện tại
    const st = ctx.store.getState()?.annotation;
    const states = Array.isArray(st?.annotations?.states) ? st.annotations.states : [];
    const cuboidStates = states.filter((s) => s && s.shapeType === 'cuboid' && !s.outside && !s.hidden);

    const activeId = st?.annotations?.activatedStateID ?? st?.canvas?.activeElement?.clientID ?? null;

    // Chuẩn bị dữ liệu hình học cho các box
    const parsedBoxes = [];
    const view = canvasInstance.view;
    const drawnObjects = view?.drawnObjects;

    for (const s of cuboidStates) {
      const pts = s.points;
      if (!Array.isArray(pts) || pts.length < 9) continue;
      let c = [pts[0], pts[1], pts[2]];
      let r = [pts[3], pts[4], pts[5]];
      let sSize = [Math.max(0.001, pts[6]), Math.max(0.001, pts[7]), Math.max(0.001, pts[8])];

      // Nếu box này đang được chọn và đang được thao tác trên canvas, ưu tiên lấy toạ độ thời gian thực từ Three.js Mesh
      if (s.clientID === activeId && drawnObjects && drawnObjects[s.clientID]?.cuboid) {
        const cub = drawnObjects[s.clientID].cuboid;
        const mesh = cub.perspective || cub.top || cub.side || cub.front;
        if (mesh && Number.isFinite(mesh.position?.x) && Number.isFinite(mesh.scale?.x)) {
          c = [mesh.position.x, mesh.position.y, mesh.position.z];
          r = [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z];
          sSize = [Math.max(0.001, mesh.scale.x), Math.max(0.001, mesh.scale.y), Math.max(0.001, mesh.scale.z)];
        }
      }

      const axes = eulerToAxes(r);
      const half = [sSize[0] * 0.5, sSize[1] * 0.5, sSize[2] * 0.5];
      const color = s.color || s.label?.color || '#1890ff';

      const maxR = Math.sqrt(half[0] * half[0] + half[1] * half[1] + half[2] * half[2]) + qcSettings.outerThreshold + 0.05;
      const boundingRadiusSq = maxR * maxR;

      parsedBoxes.push({
        clientID: s.clientID,
        center: c,
        rotation: r,
        scale: sSize,
        half,
        axes,
        color,
        state: s,
        isActive: s.clientID === activeId,
        boundingRadiusSq,
      });
    }

    // 3. Tính toán va chạm 3D giữa các cặp box (Overlap Detection)
    const overlaps = [];
    const colorBy = getCvatColorBy();

    if (qcSettings.highlightOverlap && window.CVAT3DQC?.overlap) {
      for (let i = 0; i < parsedBoxes.length; i++) {
        for (let j = i + 1; j < parsedBoxes.length; j++) {
          const b1 = parsedBoxes[i];
          const b2 = parsedBoxes[j];
          const ov = window.CVAT3DQC.overlap.compute3DOverlap(b1.state.points, b2.state.points);
          if (ov && ov.hasOverlap && ov.overlapVolume > 0.005) {
            const contrastHex = window.CVAT3DQC.overlap.getDynamicContrastColor(b1.color, b2.color, colorBy);
            const contrastRgb = window.CVAT3DQC.overlap.hexToRgb(contrastHex);
            overlaps.push({
              boxA: b1,
              boxB: b2,
              iou3d: ov.iou3d,
              volume: ov.overlapVolume,
              contrastHex,
              contrastRgb,
              center: ov.intersectionCenter,
              height: ov.intersectionHeight,
              poly2D: ov.intersectionPolygon2D,
            });
          }
        }
      }
    }

    // 4. Vẽ wireframe khối giao nhau lên Three.js Scene nếu có overlap
    if (overlaps.length > 0) {
      const Three = getThreeConstructors(scene, cloudObj);
      if (Three.BufferGeometry && Three.LineSegments && Three.LineBasicMaterial) {
        const { BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial, Group } = Three;
        const overlapGroup = new (Group || scene.constructor)();
        overlapGroup.name = 'cvat_qc_overlap_group';

      for (const ov of overlaps) {
        if (!ov.poly2D || ov.poly2D.length < 3) continue;
        const pts2D = ov.poly2D;
        const zMin = ov.center[2] - ov.height * 0.5;
        const zMax = ov.center[2] + ov.height * 0.5;

        // Tạo các cạnh viền đứng và đáy/nóc của lăng trụ giao nhau
        const edges = [];
        const n = pts2D.length;
        for (let k = 0; k < n; k++) {
          const next = (k + 1) % n;
          const p1 = pts2D[k], p2 = pts2D[next];
          // Cạnh đáy
          edges.push(p1[0], p1[1], zMin, p2[0], p2[1], zMin);
          // Cạnh nóc
          edges.push(p1[0], p1[1], zMax, p2[0], p2[1], zMax);
          // Cạnh đứng
          edges.push(p1[0], p1[1], zMin, p1[0], p1[1], zMax);
        }

        const geomLine = new BufferGeometry();
        geomLine.setAttribute('position', new BufferAttribute(new Float32Array(edges), 3));
        const matLine = new LineBasicMaterial({
          color: parseInt(ov.contrastHex.replace('#', ''), 16),
          linewidth: 2.5,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
        });
        const mesh = new LineSegments(geomLine, matLine);
        mesh.renderOrder = 9999;
        overlapGroup.add(mesh);
      }
      scene.add(overlapGroup);
    }
  }

    // 5. Thống kê & Tô màu điểm LiDAR
    let insideCount = 0;
    let innerEdgeCount = 0;
    let boundaryCount = 0;
    let nearMissedCount = 0;

    const dOuter = qcSettings.outerThreshold;
    // Bán kính hình học của hạt điểm dựa trên thanh trượt Point Size (mặc định 1.0x theo guideline)
    const pointRadius = (qcSettings.basePointRadius || 0.015) * (qcSettings.pointSize || 1.0);
    // Vùng mấp mé trong (khoảng 65% bán kính ~ 1.0cm tại 1.0x, nơi góc hạt có thể thò ra khi nhìn xiên)
    const innerRadius = pointRadius * 0.65;
    let targetBox = null;
    if (qcSettings.activeOnly && parsedBoxes.length > 0) {
      targetBox = parsedBoxes.find((b) => b.isActive) ||
                  (lastCreatedClientId ? parsedBoxes.find((b) => b.clientID === lastCreatedClientId) : null) ||
                  parsedBoxes[parsedBoxes.length - 1];
    }

    const boxesToInspect = targetBox ? [targetBox] : parsedBoxes;

    for (let i = 0; i < pointCount; i++) {
      const idx3 = i * 3;
      const px = posArr[idx3];
      const py = posArr[idx3 + 1];
      const pz = posArr[idx3 + 2];

      // A. Kiểm tra xem điểm có rơi vào thể tích tranh chấp (Overlap) hay không
      let inOverlap = false;
      if (overlaps.length > 0) {
        for (const ov of overlaps) {
          const bA = ov.boxA, bB = ov.boxB;
          const dxA = px - bA.center[0], dyA = py - bA.center[1], dzA = pz - bA.center[2];
          const lxA = dxA * bA.axes.ex[0] + dyA * bA.axes.ex[1] + dzA * bA.axes.ex[2];
          const lyA = dxA * bA.axes.ey[0] + dyA * bA.axes.ey[1] + dzA * bA.axes.ey[2];
          const lzA = dxA * bA.axes.ez[0] + dyA * bA.axes.ez[1] + dzA * bA.axes.ez[2];
          const inA = Math.abs(lxA) <= bA.half[0] && Math.abs(lyA) <= bA.half[1] && Math.abs(lzA) <= bA.half[2];

          if (inA) {
            const dxB = px - bB.center[0], dyB = py - bB.center[1], dzB = pz - bB.center[2];
            const lxB = dxB * bB.axes.ex[0] + dyB * bB.axes.ex[1] + dzB * bB.axes.ez[2];
            const lyB = dxB * bB.axes.ey[0] + dyB * bB.axes.ey[1] + dzB * bB.axes.ey[2];
            const lzB = dxB * bB.axes.ez[0] + dyB * bB.axes.ez[1] + dzB * bB.axes.ez[2];
            const inB = Math.abs(lxB) <= bB.half[0] && Math.abs(lyB) <= bB.half[1] && Math.abs(lzB) <= bB.half[2];

            if (inB) {
              colArr[idx3] = ov.contrastRgb[0];
              colArr[idx3 + 1] = ov.contrastRgb[1];
              colArr[idx3 + 2] = ov.contrastRgb[2];
              inOverlap = true;
              break;
            }
          }
        }
      }
      if (inOverlap) continue;

      // B. Phân loại theo Box mục tiêu (Target Box)
      if (!boxesToInspect || !boxesToInspect.length) continue;

      for (const box of boxesToInspect) {
        const dx = px - box.center[0];
        const dy = py - box.center[1];
        const dz = pz - box.center[2];

        // Lọc không gian siêu nhanh: Nếu điểm nằm ngoài bán kính bao quanh box thì bỏ qua luôn
        if (box.boundingRadiusSq && (dx * dx + dy * dy + dz * dz > box.boundingRadiusSq)) continue;

        // Chuyển sang toạ độ cục bộ
        const lx = dx * box.axes.ex[0] + dy * box.axes.ex[1] + dz * box.axes.ex[2];
        const ly = dx * box.axes.ey[0] + dy * box.axes.ey[1] + dz * box.axes.ey[2];
        const lz = dx * box.axes.ez[0] + dy * box.axes.ez[1] + dz * box.axes.ez[2];

        const hx = box.half[0], hy = box.half[1], hz = box.half[2];
        const qx = Math.abs(lx) - hx;
        const qy = Math.abs(ly) - hy;
        const qz = Math.abs(lz) - hz;

        // Tính khoảng cách có dấu (SDF) từ tâm hạt tới vỏ Cuboid chuẩn 1x của CVAT
        const ox = Math.max(qx, 0);
        const oy = Math.max(qy, 0);
        const oz = Math.max(qz, 0);
        const outsideDist = Math.sqrt(ox * ox + oy * oy + oz * oz);
        const insideDist = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
        const sdf = outsideDist + insideDist;

        // Kiểm tra xem điểm có thuộc vùng mặt đất ở đáy tiếp xúc không
        const isBelowBottom = lz < -hz;
        const distBelow = -hz - lz;
        const isBottomNear = qcSettings.filterGround && isBelowBottom && distBelow <= (qcSettings.bottomTolerance ?? 0.05);

        if (sdf <= 0) {
          // Tâm hạt nằm bên trong hộp
          insideCount++;

          // Xác định mặt gần nhất: nếu qz lớn nhất và lz < 0 thì mặt gần nhất là mặt đáy tiếp đất
          const isBottomFace = (lz < 0) && (qz >= qx && qz >= qy);
          if (Math.abs(sdf) <= innerRadius && qcSettings.highlightInnerEdge) {
            // Nếu bật lọc mặt đất và điểm nằm sát mặt đáy thì không báo động Mép trong
            if (!qcSettings.filterGround || !isBottomFace) {
              innerEdgeCount++;
              colArr[idx3] = COLOR_INNER_EDGE[0];
              colArr[idx3 + 1] = COLOR_INNER_EDGE[1];
              colArr[idx3 + 2] = COLOR_INNER_EDGE[2];
            }
          }
          break; // Đã tìm thấy box chứa
        } else if (sdf <= pointRadius && qcSettings.highlightBoundary) {
          // Mức 1 (Lỗi cứng - Xanh Lơ): Tâm hạt nằm ngoài hộp nhưng khoảng cách <= pointRadius:
          // Nếu điểm nằm dưới mặt đáy trong dung sai mặt đất thì bỏ qua
          if (isBottomNear) {
            break;
          }
          boundaryCount++;
          colArr[idx3] = COLOR_BOUNDARY[0];
          colArr[idx3 + 1] = COLOR_BOUNDARY[1];
          colArr[idx3 + 2] = COLOR_BOUNDARY[2];
          break;
        } else if (sdf <= dOuter && qcSettings.highlightMissed) {
          // Hạt nằm hoàn toàn bên ngoài vách (khoảng cách > pointRadius và <= dOuter)
          // Nếu điểm nằm dưới mặt đáy trong dung sai mặt đất thì bỏ qua (tránh nhuộm cam mặt đường)
          if (isBottomNear) {
            break;
          }
          nearMissedCount++;
          colArr[idx3] = COLOR_MISSED[0];
          colArr[idx3 + 1] = COLOR_MISSED[1];
          colArr[idx3 + 2] = COLOR_MISSED[2];
          break;
        }
      }
    }

    colAttr.needsUpdate = true;
    if (typeof canvasInstance.render === 'function') canvasInstance.render();
    if (typeof canvasInstance.view?.render === 'function') canvasInstance.view.render();

    // Render lại cả các khung nhìn phụ (Top, Side, Front) nếu có
    if (doms) {
      try {
        doms.perspective?.renderer?.render(doms.perspective.scene, doms.perspective.camera);
        doms.top?.renderer?.render(doms.top.scene, doms.top.camera);
        doms.side?.renderer?.render(doms.side.scene, doms.side.camera);
        doms.front?.renderer?.render(doms.front.scene, doms.front.camera);
      } catch {}
    }

    return {
      activeId,
      targetBox: targetBox ? {
        clientID: targetBox.clientID,
        labelName: targetBox.state?.label?.name || 'Box',
        color: targetBox.color,
      } : null,
      availableBoxes: parsedBoxes.map((b) => ({
        clientID: b.clientID,
        labelName: b.state?.label?.name || 'Box',
        color: b.color,
        isActive: b.isActive,
      })),
      insideCount,
      innerEdgeCount,
      boundaryCount,
      nearMissedCount,
      overlapCount: overlaps.length,
      overlaps: overlaps.map((o) => ({
        idA: o.boxA.clientID,
        idB: o.boxB.clientID,
        iou3d: o.iou3d,
        color: o.contrastHex,
      })),
    };
  }

  // Khôi phục màu gốc của point cloud
  function resetPointColors() {
    const info = getCanvasAndScene();
    if (!info || !info.cloudObj) return false;
    const { canvasInstance, scene, cloudObj } = info;
    const colAttr = cloudObj.geometry?.attributes?.color;
    if (colAttr && cloudObj.userData.__qcOriginalColors) {
      colAttr.array.set(cloudObj.userData.__qcOriginalColors);
      colAttr.needsUpdate = true;
    }
    clearOverlapVisuals(scene);
    canvasInstance.render?.();
    return true;
  }

  let boundCanvasInstance = null;
  let removeCanvasListeners = null;

  // Phát tín hiệu cập nhật trạng thái QC tới dock
  function triggerQCUpdate(frame, activeId, colorBy) {
    const stats = applyPointColorsAndQC();
    if (stats) {
      const st = ctx?.store?.getState()?.annotation;
      emitEvt({
        type: 'qc-state-updated',
        frame: frame ?? (st?.player?.frame?.number ?? 0),
        activeId: activeId ?? (st?.annotations?.activatedStateID ?? st?.canvas?.activeElement?.clientID ?? null),
        colorBy: colorBy || getCvatColorBy(),
        stats,
      });
    }
  }

  // Thiết lập trình lắng nghe sự kiện Canvas và tương tác kéo chuột thời gian thực (Live Drag Sync 60fps)
  function setupCanvasListeners() {
    const info = getCanvasAndScene();
    if (!info || !info.canvasInstance || info.canvasInstance === boundCanvasInstance) return;

    if (removeCanvasListeners) {
      try { removeCanvasListeners(); } catch {}
      removeCanvasListeners = null;
    }

    boundCanvasInstance = info.canvasInstance;
    const doms = info.doms;
    if (!doms?.perspective) return;

    const onEditOrDrawDone = () => {
      const st = ctx?.store?.getState()?.annotation;
      const frame = st?.player?.frame?.number ?? 0;
      const activeId = st?.annotations?.activatedStateID ?? st?.canvas?.activeElement?.clientID ?? null;
      const colorBy = getCvatColorBy();
      triggerQCUpdate(frame, activeId, colorBy);
    };

    const cleanupFns = [];
    const addEvt = (el, type, fn, opts) => {
      if (!el || typeof el.addEventListener !== 'function') return;
      el.addEventListener(type, fn, opts);
      cleanupFns.push(() => el.removeEventListener(type, fn, opts));
    };

    // 1. Lắng nghe các sự kiện hoàn tất sửa/vẽ/chọn trực tiếp từ CVAT 3D Canvas
    addEvt(doms.perspective, 'canvas.edited', onEditOrDrawDone);
    addEvt(doms.perspective, 'canvas.drawn', (e) => {
      const createdId = e?.detail?.clientID || e?.detail?.state?.clientID;
      if (createdId) {
        lastCreatedClientId = createdId;
      }
      setTimeout(onEditOrDrawDone, 30);
    });
    addEvt(doms.perspective, 'canvas.selected', onEditOrDrawDone);
    addEvt(doms.perspective, 'canvas.clicked', onEditOrDrawDone);
    addEvt(doms.perspective, 'canvas.dragstop', onEditOrDrawDone);
    addEvt(doms.perspective, 'canvas.canceled', onEditOrDrawDone);

    // 2. Lắng nghe trực tiếp khi nhả chuột trên bất kỳ khung nhìn nào (Top, Side, Front, Perspective)
    const onCanvasMouseUp = () => {
      setTimeout(() => onEditOrDrawDone(), 30);
    };

    ['perspective', 'top', 'side', 'front'].forEach((viewKey) => {
      if (doms[viewKey]) {
        addEvt(doms[viewKey], 'mouseup', onCanvasMouseUp);
      }
    });

    // 3. Đồng bộ thời gian thực khi đang kéo chuột (Live Drag Sync 60fps)
    let lastLiveHash = '';
    let liveRafId = null;

    const onCanvasMouseMove = (e) => {
      if (e.buttons !== 1) return; // Chỉ theo dõi khi đang giữ chuột trái thao tác hộp
      if (liveRafId) return;

      liveRafId = requestAnimationFrame(() => {
        liveRafId = null;
        const currentInfo = getCanvasAndScene();
        const view = currentInfo?.canvasInstance?.view;
        const activeId = ctx?.store?.getState()?.annotation?.annotations?.activatedStateID ??
                         ctx?.store?.getState()?.annotation?.canvas?.activeElement?.clientID ?? null;
        if (!activeId || !view?.drawnObjects?.[activeId]?.cuboid) return;

        const cub = view.drawnObjects[activeId].cuboid;
        const mesh = cub.perspective || cub.top || cub.side || cub.front;
        if (!mesh || !mesh.position || !mesh.scale) return;

        // Chuỗi hash kiểm tra sự thay đổi toạ độ / kích thước / góc xoay
        const currentHash = `${mesh.position.x.toFixed(3)}_${mesh.position.y.toFixed(3)}_${mesh.position.z.toFixed(3)}_${mesh.scale.x.toFixed(3)}_${mesh.scale.y.toFixed(3)}_${mesh.scale.z.toFixed(3)}_${mesh.rotation.z.toFixed(3)}`;
        if (currentHash !== lastLiveHash) {
          lastLiveHash = currentHash;
          const st = ctx?.store?.getState()?.annotation;
          const frame = st?.player?.frame?.number ?? 0;
          const colorBy = getCvatColorBy();
          triggerQCUpdate(frame, activeId, colorBy);
        }
      });
    };

    ['perspective', 'top', 'side', 'front'].forEach((viewKey) => {
      if (doms[viewKey]) {
        addEvt(doms[viewKey], 'mousemove', onCanvasMouseMove);
      }
    });

    // Khi nhả chuột ngoài phạm vi canvas, đảm bảo chốt cập nhật lần cuối
    const onGlobalMouseUp = () => {
      if (lastLiveHash) {
        lastLiveHash = '';
        setTimeout(() => onEditOrDrawDone(), 40);
      }
    };
    addEvt(window, 'mouseup', onGlobalMouseUp);

    removeCanvasListeners = () => {
      cleanupFns.forEach((fn) => {
        try { fn(); } catch {}
      });
    };
  }

  // Thiết lập trình lắng nghe Redux Store của CVAT
  function setupStoreWatcher() {
    if (!ctx || !ctx.store || typeof ctx.store.subscribe !== 'function') return;
    if (storeUnsubscribe) {
      try { storeUnsubscribe(); } catch {}
      storeUnsubscribe = null;
    }

    let lastFrame = null;
    let lastActiveId = null;
    let lastColorBy = null;
    let lastStates = null;
    let lastHistory = null;
    let timer = null;

    storeUnsubscribe = ctx.store.subscribe(() => {
      const st = ctx.store.getState()?.annotation;
      if (!st) return;

      const frame = st.player?.frame?.number ?? 0;
      const activeId = st.annotations?.activatedStateID ?? st.canvas?.activeElement?.clientID ?? null;
      const colorBy = getCvatColorBy();
      const states = st.annotations?.states;
      const history = st.annotations?.history;

      const frameChanged = frame !== lastFrame;
      const activeChanged = activeId !== lastActiveId;
      const colorByChanged = colorBy !== lastColorBy;
      const statesChanged = states !== lastStates;
      const historyChanged = history !== lastHistory;

      lastFrame = frame;
      lastActiveId = activeId;
      lastColorBy = colorBy;
      lastStates = states;
      lastHistory = history;

      // Nhận diện đối tượng mới tạo để cập nhật tự động
      if (statesChanged && Array.isArray(states)) {
        const cuboids = states.filter((s) => s && s.shapeType === 'cuboid' && !s.outside && !s.hidden);
        const currentCuboidIds = new Set(cuboids.map((s) => s.clientID));

        let newlyCreatedId = null;
        if (lastKnownCuboidIds.size > 0 && !frameChanged) {
          for (const id of currentCuboidIds) {
            if (!lastKnownCuboidIds.has(id)) {
              newlyCreatedId = id;
              break;
            }
          }
        }
        lastKnownCuboidIds = currentCuboidIds;

        if (newlyCreatedId) {
          lastCreatedClientId = newlyCreatedId;
          try {
            if (ctx.actionCreators?.activateObject) {
              ctx.dispatch(ctx.actionCreators.activateObject(newlyCreatedId, null, null));
            }
          } catch {}
        }
      } else if (frameChanged) {
        lastKnownCuboidIds.clear();
        lastCreatedClientId = null;
      }

      // Đảm bảo các listener canvas được gắn khi canvas sẵn sàng
      setupCanvasListeners();

      if (!frameChanged && !activeChanged && !colorByChanged && !statesChanged && !historyChanged) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        triggerQCUpdate(frame, activeId, colorBy);
      }, frameChanged ? 220 : 40);
    });
  }

  // Đăng ký trực tiếp với window.cvatUI
  function register() {
    if (ctx || !window.cvatUI || typeof window.cvatUI.registerComponent !== 'function') return !!ctx;
    window.cvatUI.registerComponent((args) => {
      ctx = args;
      setupStoreWatcher();
      setTimeout(() => {
        setupCanvasListeners();
        applyPointColorsAndQC();
      }, 500);

      return {
        name: 'CVAT 3D QC Master Tool',
        destructor: () => {
          if (storeUnsubscribe) {
            try { storeUnsubscribe(); } catch {}
            storeUnsubscribe = null;
          }
          if (removeCanvasListeners) {
            try { removeCanvasListeners(); } catch {}
            removeCanvasListeners = null;
          }
          boundCanvasInstance = null;
          resetPointColors();
          ctx = null;
        },
      };
    });
    return !!ctx;
  }

  if (!register()) {
    document.addEventListener('plugins.ready', register);
    let tries = 0;
    const t = setInterval(() => {
      if (register() || ++tries > 60) clearInterval(t);
    }, 500);
  }

  // Xử lý các yêu cầu từ bridge.js
  const methods = {
    ping() {
      return { connected: !!ctx, frame: ctx?.store?.getState()?.annotation?.player?.frame?.number ?? 0 };
    },

    getAnnotationState() {
      if (!ctx) throw new Error('Chưa kết nối được với plugin CVAT');
      const st = ctx.store.getState().annotation;
      const job = st?.job?.instance;
      if (!job) throw new Error('Chưa mở Job trên CVAT');

      const frame = st.player.frame.number;
      const activeId = st.annotations?.activatedStateID ?? st.canvas?.activeElement?.clientID ?? null;
      const colorBy = getCvatColorBy();

      return job.annotations.get(frame, true, []).then((states) => {
        const cuboids = states.filter((s) => s.shapeType === 'cuboid');
        return {
          frame,
          activeId,
          colorBy,
          cuboids: cuboids.map((c) => ({
            clientID: c.clientID,
            label: c.label.name,
            color: c.color || c.label.color,
            points: c.points,
            outside: c.outside,
            keyframe: c.keyframe,
          })),
        };
      });
    },

    updateQCSettings({ settings }) {
      Object.assign(qcSettings, settings || {});
      const stats = applyPointColorsAndQC();
      return { success: true, stats };
    },

    jumpToFrame({ frame }) {
      if (!ctx || !ctx.actionCreators) throw new Error('CVAT chưa sẵn sàng');
      ctx.dispatch(ctx.actionCreators.changeFrameAsync(Number(frame)));
      return { success: true };
    },

    focusObject({ clientID }) {
      if (!ctx || !ctx.actionCreators) throw new Error('CVAT chưa sẵn sàng');
      ctx.dispatch(ctx.actionCreators.activateObject(clientID, null, null));
      const info = getCanvasAndScene();
      info?.canvasInstance?.focusObjectByClientId?.(clientID, true);
      setTimeout(() => {
        const st = ctx?.store?.getState()?.annotation;
        const frame = st?.player?.frame?.number ?? 0;
        triggerQCUpdate(frame, clientID, getCvatColorBy());
      }, 50);
      return { success: true };
    },

    selectBox({ clientID }) {
      if (!ctx || !ctx.actionCreators) throw new Error('CVAT chưa sẵn sàng');
      ctx.dispatch(ctx.actionCreators.activateObject(clientID, null, null));
      const info = getCanvasAndScene();
      info?.canvasInstance?.focusObjectByClientId?.(clientID, true);
      setTimeout(() => {
        const st = ctx?.store?.getState()?.annotation;
        const frame = st?.player?.frame?.number ?? 0;
        triggerQCUpdate(frame, clientID, getCvatColorBy());
      }, 50);
      return { success: true };
    },

    async getAllFramesAnnotations() {
      if (!ctx) throw new Error('Chưa kết nối được với CVAT');
      const st = ctx.store.getState().annotation;
      const job = st?.job?.instance;
      if (!job) throw new Error('Chưa mở Job');

      const startFrame = job.startFrame;
      const stopFrame = job.stopFrame;
      const result = [];

      for (let f = startFrame; f <= stopFrame; f++) {
        const states = await job.annotations.get(f, true, []);
        const cuboids = states.filter((s) => s.shapeType === 'cuboid');
        result.push({
          frame: f,
          cuboids: cuboids.map((c) => ({
            clientID: c.clientID,
            label: c.label.name,
            points: c.points,
            outside: c.outside,
            keyframe: c.keyframe,
          })),
        });
      }
      return { startFrame, stopFrame, frames: result };
    },

    resetPointColors() {
      return { success: resetPointColors() };
    },
  };

  document.addEventListener(REQ, async (e) => {
    let id, method, params;
    try {
      const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      ({ id, method, params } = data);
    } catch (err) {
      return;
    }

    try {
      const fn = methods[method];
      if (!fn) throw new Error(`Không tìm thấy phương thức [${method}]`);
      const result = await fn(params || {});
      emitRes(id, result);
    } catch (err) {
      emitRes(id, null, err);
    }
  });
})();
