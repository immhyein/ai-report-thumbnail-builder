# AI Report Thumbnail Builder

원티드 **AI 커리어 리포트** 마케팅 썸네일에 쓸 픽셀 그래픽을 만들기 위해 제작한 웹 빌더입니다.
캔버스 위에서 마우스를 움직이면 지나간 자리를 따라 픽셀이 나타났다 사라지고, 마음에 드는 순간을 캡처해 SVG로 바로 가져갈 수 있습니다.

**▶ 사이트 바로가기: https://immhyein.github.io/ai-report-thumbnail-builder/**

## 기능

- **Trail**: 픽셀이 사라지는 방식 선택 (Trace: 빠르게 / Ghost: 천천히)
- **Pixel size**: 캔버스를 가로 몇 칸으로 나눌지 조절
- **Fill**: 배경 그라데이션 2색과 픽셀 색 지정, 투명 배경 옵션
- **Captures**: 캔버스를 클릭하면 그 순간의 형태를 저장
- **Export**: 저장한 형태를 SVG 코드로 복사해 Figma에 바로 붙여넣기

## 제작

- Figma Make로 초안을 만든 뒤 코드로 다듬었습니다.
- React · TypeScript · Vite

## 로컬에서 실행하기

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다.
