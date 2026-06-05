import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const publicSvgPath = path.join(root, "public", "icon.svg");
const outputDir = path.join(root, "buildResources");

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const size = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);

  size.writeUInt32BE(data.length, 0);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([size, typeBuffer, data, checksum]);
}

function rectangle(x, y, width, height) {
  return (pointX, pointY) =>
    pointX >= x &&
    pointX <= x + width &&
    pointY >= y &&
    pointY <= y + height;
}

function roundedRectangle(x, y, width, height, radius) {
  return (pointX, pointY) => {
    if (pointX >= x + radius && pointX <= x + width - radius && pointY >= y && pointY <= y + height) {
      return true;
    }

    if (pointY >= y + radius && pointY <= y + height - radius && pointX >= x && pointX <= x + width) {
      return true;
    }

    const corners = [
      [x + radius, y + radius],
      [x + width - radius, y + radius],
      [x + radius, y + height - radius],
      [x + width - radius, y + height - radius],
    ];

    return corners.some(([cornerX, cornerY]) => {
      const dx = pointX - cornerX;
      const dy = pointY - cornerY;
      return dx * dx + dy * dy <= radius * radius;
    });
  };
}

function polygon(points) {
  return (pointX, pointY) => {
    let inside = false;

    for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
      const [currentX, currentY] = points[current];
      const [previousX, previousY] = points[previous];
      const intersects =
        currentY > pointY !== previousY > pointY &&
        pointX < ((previousX - currentX) * (pointY - currentY)) / ((previousY - currentY) || 1e-9) + currentX;

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  };
}

function anyOf(...shapes) {
  return (pointX, pointY) => shapes.some((shape) => shape(pointX, pointY));
}

function without(baseShape, ...cutouts) {
  return (pointX, pointY) => baseShape(pointX, pointY) && !cutouts.some((shape) => shape(pointX, pointY));
}

function createPng(size) {
  const background = roundedRectangle(size * 0.05, size * 0.05, size * 0.9, size * 0.9, size * 0.18);
  const inner = roundedRectangle(size * 0.09, size * 0.09, size * 0.82, size * 0.82, size * 0.15);
  const border = without(background, inner);

  const eShape = anyOf(
    rectangle(size * 0.18, size * 0.24, size * 0.16, size * 0.52),
    rectangle(size * 0.18, size * 0.24, size * 0.26, size * 0.08),
    rectangle(size * 0.18, size * 0.46, size * 0.22, size * 0.08),
    rectangle(size * 0.18, size * 0.68, size * 0.26, size * 0.08),
  );

  const sShape = anyOf(
    rectangle(size * 0.43, size * 0.24, size * 0.18, size * 0.08),
    rectangle(size * 0.43, size * 0.46, size * 0.18, size * 0.08),
    rectangle(size * 0.43, size * 0.68, size * 0.18, size * 0.08),
    rectangle(size * 0.43, size * 0.24, size * 0.08, size * 0.30),
    rectangle(size * 0.53, size * 0.46, size * 0.08, size * 0.30),
  );

  const yShape = anyOf(
    rectangle(size * 0.71, size * 0.48, size * 0.08, size * 0.28),
    polygon([
      [size * 0.62, size * 0.24],
      [size * 0.70, size * 0.24],
      [size * 0.75, size * 0.43],
      [size * 0.69, size * 0.43],
    ]),
    polygon([
      [size * 0.80, size * 0.24],
      [size * 0.88, size * 0.24],
      [size * 0.80, size * 0.43],
      [size * 0.74, size * 0.43],
    ]),
  );

  const rgba = Buffer.alloc(size * size * 4);

  for (let pointY = 0; pointY < size; pointY += 1) {
    for (let pointX = 0; pointX < size; pointX += 1) {
      const offset = (pointY * size + pointX) * 4;
      let red = 7;
      let green = 7;
      let blue = 7;
      let alpha = 0;

      if (background(pointX, pointY)) {
        alpha = 255;
      }

      if (border(pointX, pointY) || eShape(pointX, pointY) || sShape(pointX, pointY) || yShape(pointX, pointY)) {
        red = 245;
        green = 245;
        blue = 245;
        alpha = 255;
      }

      rgba[offset] = red;
      rgba[offset + 1] = green;
      rgba[offset + 2] = blue;
      rgba[offset + 3] = alpha;
    }
  }

  const rowWidth = size * 4 + 1;
  const raw = Buffer.alloc(rowWidth * size);

  for (let row = 0; row < size; row += 1) {
    raw[row * rowWidth] = 0;
    rgba.copy(raw, row * rowWidth + 1, row * size * 4, (row + 1) * size * 4);
  }

  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    header,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIco(pngBuffer) {
  const fileHeader = Buffer.alloc(6);
  fileHeader.writeUInt16LE(0, 0);
  fileHeader.writeUInt16LE(1, 2);
  fileHeader.writeUInt16LE(1, 4);

  const directory = Buffer.alloc(16);
  directory[0] = 0;
  directory[1] = 0;
  directory.writeUInt16LE(1, 4);
  directory.writeUInt16LE(32, 6);
  directory.writeUInt32LE(pngBuffer.length, 8);
  directory.writeUInt32LE(22, 12);

  return Buffer.concat([fileHeader, directory, pngBuffer]);
}

function createIcns(pngBuffer) {
  const fileHeader = Buffer.alloc(8);
  fileHeader.write("icns", 0, "ascii");
  fileHeader.writeUInt32BE(pngBuffer.length + 16, 4);

  const iconHeader = Buffer.alloc(8);
  iconHeader.write("ic10", 0, "ascii");
  iconHeader.writeUInt32BE(pngBuffer.length + 8, 4);

  return Buffer.concat([fileHeader, iconHeader, pngBuffer]);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const svg = await readFile(publicSvgPath, "utf8");
  await writeFile(path.join(outputDir, "icon.svg"), svg, "utf8");

  const icon512 = createPng(512);
  const icon256 = createPng(256);

  await writeFile(path.join(outputDir, "icon.png"), icon512);
  await writeFile(path.join(outputDir, "icon-256.png"), icon256);
  await writeFile(path.join(outputDir, "icon.ico"), createIco(icon256));
  await writeFile(path.join(outputDir, "icon.icns"), createIcns(icon512));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
