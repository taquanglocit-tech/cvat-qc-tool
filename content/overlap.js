// overlap.js - Nhận diện va chạm / trùng lặp (3D Overlap) & Bộ sinh màu tương phản động
// Hỗ trợ tính toán thể tích giao nhau 3D và đổi màu thông minh theo chế độ Label / Instance

(() => {
  const QC = (globalThis.CVAT3DQC ||= {});
  const G = QC.geom;

  // Chuyển đổi HEX sang RGB [0..1]
  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return [1, 0, 0];
    let c = hex.replace('#', '').trim();
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    if (Number.isNaN(num)) return [1, 0, 0];
    return [
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255,
    ];
  }

  // Chuyển RGB [0..1] sang HSL [0..360, 0..1, 0..1]
  function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h * 360, s, l];
  }

  // Chuyển HSL sang HEX
  function hslToHex(h, s, l) {
    h = (h % 360 + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }

    const to255 = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${to255(r)}${to255(g)}${to255(b)}`;
  }

  // Bộ sinh màu tương phản động cho phần Overlap:
  // Đảm bảo màu phần đè nhau luôn KHÁC BIỆT HOÀN TOÀN so với màu của cả 2 vật thể
  function getDynamicContrastColor(colorA, colorB, colorByMode = 'Label') {
    const rgbA = hexToRgb(colorA);
    const rgbB = hexToRgb(colorB);
    const [hA, sA, lA] = rgbToHsl(rgbA[0], rgbA[1], rgbA[2]);
    const [hB, sB, lB] = rgbToHsl(rgbB[0], rgbB[1], rgbB[2]);

    // Trường hợp 1: Hai vật thể CÙNG màu (ví dụ cùng class trong chế độ Label, hoặc trùng màu)
    const isSameColor = Math.abs(hA - hB) < 15 && Math.abs(lA - lB) < 0.2;
    if (isSameColor || colorByMode === 'Label') {
      // Xoay góc bù 180 độ trên vòng tròn màu HSL
      const contrastH = (hA + 180) % 360;
      return hslToHex(contrastH, 1.0, 0.55);
    }

    // Trường hợp 2: Hai vật thể KHÁC màu (chế độ Instance/Group)
    // Tìm góc cách xa nhất cả 2 góc hA và hB trên vòng tròn 360 độ
    const diff = Math.abs(hA - hB);
    let bestH = (hA + 180) % 360;
    if (diff < 120) {
      const mid = (hA + hB) / 2;
      bestH = (mid + 180) % 360;
    } else {
      // Chọn màu đỏ rực huỳnh quang hoặc magenta nếu không trùng
      const alertHues = [0, 310, 60, 180]; // Đỏ, Hồng Sen, Vàng, Xanh Ngọc
      let maxDist = -1;
      for (const cand of alertHues) {
        const dA = Math.min(Math.abs(cand - hA), 360 - Math.abs(cand - hA));
        const dB = Math.min(Math.abs(cand - hB), 360 - Math.abs(cand - hB));
        const minDist = Math.min(dA, dB);
        if (minDist > maxDist) {
          maxDist = minDist;
          bestH = cand;
        }
      }
    }
    return hslToHex(bestH, 1.0, 0.55);
  }

  // Thuật toán cắt đa giác phẳng Sutherland-Hodgman (cho hình chiếu 2D BEV)
  function clipPolygonWithLine(poly, p1, p2) {
    const out = [];
    if (!poly || poly.length < 3) return out;
    const isInside = (p) => (p2[0] - p1[0]) * (p[1] - p1[1]) - (p2[1] - p1[1]) * (p[0] - p1[0]) >= -1e-6;

    const intersect = (a, b) => {
      const a1 = p2[1] - p1[1], b1 = p1[0] - p2[0], c1 = a1 * p1[0] + b1 * p1[1];
      const a2 = b[1] - a[1], b2 = a[0] - b[0], c2 = a2 * a[0] + b2 * a[1];
      const det = a1 * b2 - a2 * b1;
      if (Math.abs(det) < 1e-9) return [a[0], a[1]];
      return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
    };

    let prev = poly[poly.length - 1];
    let prevInside = isInside(prev);

    for (const curr of poly) {
      const currInside = isInside(curr);
      if (currInside) {
        if (!prevInside) out.push(intersect(prev, curr));
        out.push(curr);
      } else if (prevInside) {
        out.push(intersect(prev, curr));
      }
      prev = curr;
      prevInside = currInside;
    }
    return out;
  }

  // Tính diện tích đa giác 2D (Công thức Shoelace)
  function polygonArea(poly) {
    if (!poly || poly.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    }
    return Math.abs(area) * 0.5;
  }

  // Cắt 2 đa giác lồi 2D
  function intersectConvexPolygons(polyA, polyB) {
    let result = polyA;
    for (let i = 0; i < polyB.length; i++) {
      const j = (i + 1) % polyB.length;
      result = clipPolygonWithLine(result, polyB[i], polyB[j]);
      if (result.length < 3) return [];
    }
    return result;
  }

  // Lấy 4 đỉnh hình chiếu mặt phẳng đáy XY của Cuboid
  function getBoxBEVQuad(box) {
    const { center, scale, rotation } = box;
    const { ex, ey } = G.eulerToAxes(rotation);
    const hx = scale[0] * 0.5, hy = scale[1] * 0.5;

    // 4 góc theo thứ tự ngược chiều kim đồng hồ
    return [
      [center[0] - hx * ex[0] - hy * ey[0], center[1] - hx * ex[1] - hy * ey[1]],
      [center[0] + hx * ex[0] - hy * ey[0], center[1] + hx * ex[1] - hy * ey[1]],
      [center[0] + hx * ex[0] + hy * ey[0], center[1] + hx * ex[1] + hy * ey[1]],
      [center[0] - hx * ex[0] + hy * ey[0], center[1] - hx * ex[1] + hy * ey[1]],
    ];
  }

  // Kiểm tra và tính thể tích giao nhau 3D giữa 2 Cuboid
  function compute3DOverlap(rawPointsA, rawPointsB) {
    const boxA = G.parseCuboid(rawPointsA);
    const boxB = G.parseCuboid(rawPointsB);
    if (!boxA || !boxB) return null;

    // 1. Kiểm tra dải độ cao trục Z (hoặc trục đứng)
    const zMinA = boxA.center[2] - boxA.scale[2] * 0.5;
    const zMaxA = boxA.center[2] + boxA.scale[2] * 0.5;
    const zMinB = boxB.center[2] - boxB.scale[2] * 0.5;
    const zMaxB = boxB.center[2] + boxB.scale[2] * 0.5;

    const overlapZMin = Math.max(zMinA, zMinB);
    const overlapZMax = Math.min(zMaxA, zMaxB);
    const overlapHeight = overlapZMax - overlapZMin;

    if (overlapHeight <= 0.005) {
      return { hasOverlap: false, iou3d: 0, overlapVolume: 0 };
    }

    // 2. Cắt đa giác đáy 2D (BEV)
    const quadA = getBoxBEVQuad(boxA);
    const quadB = getBoxBEVQuad(boxB);
    const polyInter = intersectConvexPolygons(quadA, quadB);
    const overlapArea = polygonArea(polyInter);

    if (overlapArea <= 0.005) {
      return { hasOverlap: false, iou3d: 0, overlapVolume: 0 };
    }

    const overlapVolume = overlapArea * overlapHeight;
    const volA = boxA.scale[0] * boxA.scale[1] * boxA.scale[2];
    const volB = boxB.scale[0] * boxB.scale[1] * boxB.scale[2];
    const unionVol = volA + volB - overlapVolume;
    const iou3d = unionVol > 0 ? overlapVolume / unionVol : 0;
    const ratioA = volA > 0 ? overlapVolume / volA : 0;
    const ratioB = volB > 0 ? overlapVolume / volB : 0;

    // Tính tâm và kích thước tương đối của vùng giao nhau (dùng cho vẽ khối wireframe)
    let cx = 0, cy = 0;
    for (const p of polyInter) {
      cx += p[0];
      cy += p[1];
    }
    cx /= polyInter.length;
    cy /= polyInter.length;
    const cz = (overlapZMin + overlapZMax) * 0.5;

    return {
      hasOverlap: true,
      iou3d,
      overlapVolume,
      ratioA,
      ratioB,
      intersectionCenter: [cx, cy, cz],
      intersectionHeight: overlapHeight,
      intersectionPolygon2D: polyInter,
    };
  }

  QC.overlap = {
    hexToRgb,
    rgbToHsl,
    hslToHex,
    getDynamicContrastColor,
    compute3DOverlap,
  };
})();
