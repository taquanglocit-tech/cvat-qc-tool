// geom.js - Lõi toán học 3D hình học cho CVAT 3D QC Tool
// Tính toán Signed Distance Function (SDF), biến đổi hệ trục OBB và phân loại điểm LiDAR

(() => {
  const QC = (globalThis.CVAT3DQC ||= {});

  // Giải mã định dạng mảng 16 phần tử cuboid của CVAT:
  // [x, y, z, rx, ry, rz, width, height, depth, ...]
  function parseCuboid(rawPoints) {
    if (!Array.isArray(rawPoints) || rawPoints.length < 9) return null;
    const c = [Number(rawPoints[0]) || 0, Number(rawPoints[1]) || 0, Number(rawPoints[2]) || 0];
    const r = [Number(rawPoints[3]) || 0, Number(rawPoints[4]) || 0, Number(rawPoints[5]) || 0];
    const s = [
      Math.max(0.001, Number(rawPoints[6]) || 0),
      Math.max(0.001, Number(rawPoints[7]) || 0),
      Math.max(0.001, Number(rawPoints[8]) || 0),
    ];
    return {
      center: c,
      rotation: r, // [rx, ry, rz] theo radian
      scale: s,    // [width, height, depth]
      half: [s[0] * 0.5, s[1] * 0.5, s[2] * 0.5],
    };
  }

  // Tạo 3 vector trục cơ sở (ex, ey, ez) từ góc Euler (theo thứ tự quay chuẩn Three.js: XYZ)
  function eulerToAxes(r) {
    const rx = r[0], ry = r[1], rz = r[2];
    const a = Math.cos(rx), b = Math.sin(rx);
    const c = Math.cos(ry), d = Math.sin(ry);
    const e = Math.cos(rz), f = Math.sin(rz);

    const ce = c * e;
    const cf = c * f;
    const de = d * e;
    const df = d * f;

    const ex = [ce, a * f + b * de, b * f - a * de];
    const ey = [-cf, a * e - b * df, b * e + a * df];
    const ez = [d, -b * c, a * c];

    return { ex, ey, ez };
  }

  // Chuyển một điểm thế giới P sang hệ tọa độ cục bộ của Cuboid
  function worldToLocal(p, center, axes) {
    const dx = p[0] - center[0];
    const dy = p[1] - center[1];
    const dz = p[2] - center[2];

    const { ex, ey, ez } = axes;
    return [
      dx * ex[0] + dy * ex[1] + dz * ex[2],
      dx * ey[0] + dy * ey[1] + dz * ey[2],
      dx * ez[0] + dy * ez[1] + dz * ez[2],
    ];
  }

  // Hàm khoảng cách có dấu (Signed Distance Function - SDF) từ điểm cục bộ tới hộp AABB
  // Trả về:
  //   sdf < 0: Điểm nằm TRONG hộp (giá trị tuyệt đối là khoảng cách tới vách gần nhất)
  //   sdf = 0: Điểm nằm ngay trên bề mặt vỏ hộp
  //   sdf > 0: Điểm nằm NGOÀI hộp (giá trị là khoảng cách Euclidean ngắn nhất tới mặt hộp)
  function boxSDF(localPoint, halfSize) {
    const qx = Math.abs(localPoint[0]) - halfSize[0];
    const qy = Math.abs(localPoint[1]) - halfSize[1];
    const qz = Math.abs(localPoint[2]) - halfSize[2];

    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    const outsideDist = Math.sqrt(ox * ox + oy * oy + oz * oz);

    const insideDist = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
    return outsideDist + insideDist;
  }

  // Phân loại điểm LiDAR theo các ngưỡng QC
  // Trạng thái trả về:
  //  0: OUTSIDE_FAR       - Điểm ngoài xa (Background)
  //  1: NEAR_MISSED       - Điểm lọt ngoài nằm trong cự ly d_outer (cần QC soi sót điểm)
  //  2: BOUNDARY          - Điểm ranh giới mép (trong phạm vi +/- delta quanh vỏ 1x)
  //  3: INSIDE            - Điểm nằm hẳn bên trong ruột xe
  function classifyPoint(localPoint, halfSize, outerThreshold, boundaryShell) {
    const sdf = boxSDF(localPoint, halfSize);

    if (sdf <= 0) {
      return 3;   // INSIDE (Nằm trong hộp hợp lệ)
    }

    // Bên ngoài (sdf > 0)
    if (sdf <= boundaryShell) {
      return 2;   // BOUNDARY (Bị một nửa ở ngoài)
    }
    if (sdf <= outerThreshold) {
      return 1;   // NEAR_MISSED (Lọt ngoài trong ngưỡng)
    }
    return 0;     // OUTSIDE_FAR
  }

  // Tính 8 đỉnh tọa độ thế giới của Cuboid
  function getBoxCorners(box) {
    const { center, scale, rotation } = box;
    const { ex, ey, ez } = eulerToAxes(rotation);
    const hx = scale[0] * 0.5, hy = scale[1] * 0.5, hz = scale[2] * 0.5;

    const corners = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          corners.push([
            center[0] + sx * hx * ex[0] + sy * hy * ey[0] + sz * hz * ez[0],
            center[1] + sx * hx * ex[1] + sy * hy * ey[1] + sz * hz * ez[1],
            center[2] + sx * hx * ex[2] + sy * hy * ey[2] + sz * hz * ez[2],
          ]);
        }
      }
    }
    return corners;
  }

  QC.geom = {
    parseCuboid,
    eulerToAxes,
    worldToLocal,
    boxSDF,
    classifyPoint,
    getBoxCorners,
  };
})();
