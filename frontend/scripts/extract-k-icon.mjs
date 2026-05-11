// K-Brain 로고에서 좌측 K 아이콘만 잘라 favicon용 PNG 생성
import sharp from 'sharp';

const src = 'public/k-brain-logo.png';

// 원본 3233x1326 기준 K 아이콘 영역 추정 (조정 가능)
const region = { left: 100, top: 130, width: 950, height: 1050 };

const transparent = { r: 255, g: 255, b: 255, alpha: 0 };

// favicon (32x32 — 512에서 다운샘플)
await sharp(src)
  .extract(region)
  .resize(512, 512, { fit: 'contain', background: transparent })
  .png()
  .toFile('src/app/icon.png');

// apple-touch-icon (180x180)
await sharp(src)
  .extract(region)
  .resize(180, 180, { fit: 'contain', background: transparent })
  .png()
  .toFile('src/app/apple-icon.png');

console.log('Generated src/app/icon.png + src/app/apple-icon.png');
