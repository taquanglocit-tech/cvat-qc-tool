// qc-scanner.js - Bộ quét lỗi tự động toàn Job (Pre-flight QA Inspector)
// Tự động phân tích toàn bộ các frame trong RAM để phát hiện: Overlap, Lệch kích thước, Nhảy cóc tốc độ

(() => {
  const QC = (globalThis.CVAT3DQC ||= {});
  const O = QC.overlap;
  const G = QC.geom;

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  async function runJobScan() {
    const jobData = await QC.bridge.getAllFramesAnnotations();
    if (!jobData || !Array.isArray(jobData.frames)) {
      throw new Error('Không lấy được dữ liệu các frame');
    }

    const issues = [];
    const tracksMap = new Map(); // clientID -> [ { frame, points, outside } ]

    // 1. Quét lỗi theo từng Frame: Overlap (Chồng lấn giữa các box)
    for (const f of jobData.frames) {
      const frameNum = f.frame;
      const cuboids = (f.cuboids || []).filter((c) => !c.outside && Array.isArray(c.points) && c.points.length >= 9);

      // Thu thập dữ liệu theo Track để phân tích chuỗi thời gian
      for (const c of cuboids) {
        if (!tracksMap.has(c.clientID)) tracksMap.set(c.clientID, []);
        tracksMap.get(c.clientID).push({ frame: frameNum, points: c.points, label: c.label });
      }

      // Kiểm tra Overlap giữa các cặp box trong frame
      const n = cuboids.length;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const cA = cuboids[i];
          const cB = cuboids[j];
          const ov = O.compute3DOverlap(cA.points, cB.points);
          if (ov && ov.hasOverlap && (ov.iou3d >= 0.05 || ov.overlapVolume >= 0.05)) {
            issues.push({
              type: 'OVERLAP',
              severity: ov.iou3d >= 0.20 ? 'HIGH' : 'MEDIUM',
              frame: frameNum,
              clientID: cA.clientID,
              secondaryID: cB.clientID,
              labelA: cA.label,
              labelB: cB.label,
              iou3d: ov.iou3d,
              volume: ov.overlapVolume,
              title: `Trùng lặp 3D (${(ov.iou3d * 100).toFixed(1)}%)`,
              desc: `#${cA.clientID} (${cA.label}) đè lên #${cB.clientID} (${cB.label})`,
            });
          }
        }
      }
    }

    // 2. Quét lỗi theo chuỗi Track: Kích thước co giãn không đều & Nhảy cóc tốc độ
    for (const [clientID, instances] of tracksMap.entries()) {
      if (instances.length < 2) continue;

      const lengths = [];
      const widths = [];
      const heights = [];

      for (const inst of instances) {
        const box = G.parseCuboid(inst.points);
        if (box) {
          lengths.push(box.scale[0]);
          widths.push(box.scale[1]);
          heights.push(box.scale[2]);
        }
      }

      const medL = median(lengths);
      const medW = median(widths);
      const medH = median(heights);

      // Kiểm tra biến động kích thước
      for (let k = 0; k < instances.length; k++) {
        const inst = instances[k];
        const box = G.parseCuboid(inst.points);
        if (!box) continue;

        const diffL = Math.abs(box.scale[0] - medL);
        const diffW = Math.abs(box.scale[1] - medW);
        const diffH = Math.abs(box.scale[2] - medH);
        const maxDiff = Math.max(diffL, diffW, diffH);

        if (maxDiff >= 0.06) {
          // Lệch trên 6cm so với chuẩn median
          issues.push({
            type: 'SIZE_INCONSISTENCY',
            severity: maxDiff >= 0.15 ? 'HIGH' : 'MEDIUM',
            frame: inst.frame,
            clientID,
            labelA: inst.label,
            title: `Kích thước lệch ${(maxDiff * 100).toFixed(0)}cm`,
            desc: `#${clientID} (${inst.label}) co giãn bất thường so với kích thước chuẩn track`,
          });
        }

        // Kiểm tra bước nhảy vị trí bất thường (Speed spike)
        if (k > 0) {
          const prevInst = instances[k - 1];
          const prevBox = G.parseCuboid(prevInst.points);
          const frameGap = inst.frame - prevInst.frame;
          if (prevBox && frameGap === 1) {
            const dx = box.center[0] - prevBox.center[0];
            const dy = box.center[1] - prevBox.center[1];
            const dz = box.center[2] - prevBox.center[2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Xe nhảy vọt trên 4m trong 1 frame
            if (dist >= 4.0) {
              issues.push({
                type: 'SPEED_SPIKE',
                severity: dist >= 7.0 ? 'HIGH' : 'LOW',
                frame: inst.frame,
                clientID,
                labelA: inst.label,
                title: `Nhảy cóc vị trí (${dist.toFixed(1)}m/frame)`,
                desc: `#${clientID} (${inst.label}) di chuyển quá nhanh hoặc gán nhầm xe`,
              });
            }
          }
        }
      }
    }

    // Sắp xếp các lỗi theo Frame tăng dần
    issues.sort((a, b) => a.frame - b.frame);

    return {
      totalFrames: jobData.frames.length,
      totalIssues: issues.length,
      issues,
    };
  }

  QC.scanner = {
    runJobScan,
  };
})();
