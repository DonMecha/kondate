import sharp from "sharp";
await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="white"/><text x="70" y="220" font-family="sans-serif" font-size="95" fill="black">豚こま肉 300g</text><text x="70" y="420" font-family="sans-serif" font-size="120" font-weight="bold" fill="black">税込 180円</text></svg>',
  ),
)
  .png()
  .toFile("docs/price-label.png");
