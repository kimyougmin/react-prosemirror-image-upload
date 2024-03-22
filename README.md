# react-prosemirror-image-upload
---------------------------------
input 태그에서 이미지를 선택하여 에디터에 삽입함.

## 사용법
input 태그에 이미지를 삽입하면 아래의 uploadFile로 전달됨 
실제 사용 시에는 setTimeout을 제거하고 서버와 통신하는 코드 작성
```ts
function uploadFile(file: Blob) {
    let reader = new FileReader();
    // fetch로 서버 통신
    return new Promise((accept, fail) => {
        reader.onload = () => accept(reader.result);
        reader.onerror = () => fail(reader.error);
        // 비동기성을 가시화하기 위한 약간의 추가 지연 => Some extra delay to make the asynchronicity visible
        setTimeout(() => reader.readAsDataURL(file), 1500);
    });
}
```
통신이 완료되어 http 형식의 url이 반환되면 아래의 url로 서버에서 이미지를 받아옴
필요에 따라 너비, 높이 등을 추가로 설정하면 됨
```ts
uploadFile(file).then(
        (url) => {
            let pos = findPlaceholder(view.state, id);
            // If the content around the placeholder has been deleted, drop
            // the image
            if (pos == null) return;
            // Otherwise, insert it at the placeholder's position, and remove
            // the placeholder
            view.dispatch(
                view.state.tr
                    .replaceWith(
                        pos,
                        pos,
                        mySchema.nodes.resizableImage.create({
                            src:
                                url
                        })
                    )
                    .setMeta(placeholderPlugin, { remove: { id } })
            );
        },
        () => {
            // On failure, just clean up the placeholder
            view.dispatch(tr.setMeta(placeholderPlugin, { remove: { id } }));
        }
    );
```

