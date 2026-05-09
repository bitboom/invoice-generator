# Invoice Generator

GitHub Pages에서 바로 호스팅 가능한 정적 견적서/인보이스 생성기입니다.

## 개인정보 / 사업자 정보 비노출 방식

이 프로젝트는 사업장 정보, 입금계좌, 로고를 저장소에 포함하지 않습니다.

- 사업장 정보는 브라우저 폼에서 직접 입력합니다.
- 입금계좌도 브라우저 폼에서 직접 입력합니다.
- 로고는 브라우저에서 이미지 파일로 업로드합니다.
- 입력값과 업로드 로고는 해당 브라우저의 `localStorage`에만 저장됩니다.
- GitHub Pages에는 정적 파일만 올라가며, 서버 저장/전송 기능은 없습니다.

## 기능

- 사업장 정보 입력
- 입금계좌 입력
- 로고 업로드(PNG 투명 배경 유지)
- 배경색/테마색 팔레트 선택
- 품목/수량/단가/합계 실시간 편집
- 합계, 부가세 10%, 공급가액 자동 계산
- Classic / Minimal / Bold 3개 템플릿
- 모든 입력값이 3개 템플릿에 공통 적용
- 입력값 브라우저 localStorage 저장
- A4 미리보기 및 PNG 이미지 다운로드
- 인쇄 지원

## GitHub Pages 배포

이 폴더의 내용을 저장소 루트에 올리고 GitHub Pages를 `main / root`로 켜면 됩니다.

```bash
git init
git add .
git commit -m "Add private invoice generator"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

GitHub 저장소 Settings → Pages → Deploy from a branch → `main` / `/root` 선택.

## 로컬 확인

```bash
python3 -m http.server 8124
# http://127.0.0.1:8124 접속
```
