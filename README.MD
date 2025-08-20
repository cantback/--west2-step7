# 安装依赖（含 SFC 编译器）
npm install

# 构建
npx ts-node src/build.ts

# 预览
cd dist && python -m http.server 8080