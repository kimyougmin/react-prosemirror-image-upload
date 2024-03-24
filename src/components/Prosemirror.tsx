import React, { createRef, useEffect, useState } from "react";
import { Decoration, DecorationSet, NodeView } from "prosemirror-view";
import {
    Schema,
    DOMParser,
    NodeSpec,
    Node as ProsemirrorNode
} from "prosemirror-model";
import {
    EditorState,
    NodeSelection,
    PluginKey,
    Plugin,
    Transaction
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema, nodes } from "prosemirror-schema-basic";
import { exampleSetup } from "prosemirror-example-setup";
import styled from "styled-components";
import './style.css';

const StyledDiv = styled.div`
  placeholder {
    display: inline;
    border: 1px solid #ccc;
    color: #ccc;
  }
  placeholder:after {
    content: "☁";
    font-size: 200%;
    line-height: 0.1;
    font-weight: bold;
  }
`;
const reactPropsKey = new PluginKey("reactProps");
function reactProps(initialProps: any) {
    return new Plugin({
        key: reactPropsKey,
        state: {
            init: () => initialProps,
            apply: (tr, prev) => tr.getMeta(reactPropsKey) || prev
        }
    });
}

const resizableImage: NodeSpec = {
    inline: true,
    attrs: {
        src: {},
        width: { default: "5em" },
        alt: { default: null },
        title: { default: null },
        alignment: { default: "center" }
    },
    group: "inline",
    draggable: true,
    parseDOM: [
        {
            priority: 51, // must be higher than the default image spec
            tag: "img[src][width]",
            getAttrs(dom2: Node | string) {
                const dom = dom2 as Element;
                return {
                    src: dom.getAttribute("src"),
                    title: dom.getAttribute("title"),
                    alt: dom.getAttribute("alt"),
                    width: dom.getAttribute("width"),
                    alignment:
                        dom.getAttribute("class") === "center"
                            ? "center"
                            : dom.getAttribute("class") === "right"
                                ? "right"
                                : "left"
                };
            }
        }
    ],
    // TODO if we don't define toDom, something weird happens: dragging the image will not move it but clone it. Why?
    toDOM(node: ProsemirrorNode) {
        const attrs = { style: `width: ${node.attrs?.width}` };
        return ["div", { ...node.attrs, ...attrs }];
    }
};

function getFontSize(element: HTMLElement) {
    return parseFloat(getComputedStyle(element).fontSize);
}

class FootnoteView implements NodeView {
    dom: HTMLElement;
    img: HTMLImageElement;
    handle: HTMLSpanElement;

    constructor(node: ProsemirrorNode, view: EditorView, getPos: () => number) {
        const outer = document.createElement("div");
        outer.style.position = "relative";
        outer.style.width = node.attrs?.width as string;
        //outer.style.border = "1px solid blue"
        outer.style.display = "block";
        //outer.style.paddingRight = "0.25em"
        outer.style.lineHeight = "0"; // necessary so the bottom right arrow is aligned nicely
        outer.style.marginLeft = "auto";
        outer.style.marginRight = "auto";
        const img = document.createElement("img");
        img.setAttribute("src", node.attrs?.src as string);
        img.style.width = "100%";
        //img.style.border = "1px solid red"

        const handle = document.createElement("span");
        handle.style.position = "absolute";
        handle.style.bottom = "0px";
        handle.style.right = "0px";
        handle.style.width = "10px";
        handle.style.height = "10px";
        handle.style.border = "3px solid black";
        handle.style.borderTop = "none";
        handle.style.borderLeft = "none";
        handle.style.display = "none";
        handle.style.cursor = "nwse-resize";

        handle.onmousedown = function (e) {
            e.preventDefault();

            const startX = e.pageX;
            // const startY = e.pageY;

            const fontSize = getFontSize(outer);

            const startWidth = parseFloat(
                (node.attrs?.width as string).match(/(.+)em/)?.[1]!
            );

            const onMouseMove = (e: MouseEvent) => {
                const currentX = e.pageX;
                // const currentY = e.pageY;

                const diffInPx = currentX - startX;
                const diffInEm = diffInPx / fontSize;

                outer.style.width = `${startWidth + diffInEm}em`;
            };

            const onMouseUp = (e: MouseEvent) => {
                e.preventDefault();

                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                let saveThisPos = getPos();
                let transaction = view?.state.tr.setNodeMarkup(getPos(), undefined, {
                    src: node.attrs?.src,
                    width: outer.style.width
                });
                let resolvedPos = transaction.doc.resolve(saveThisPos);
                let nodeSelection = new NodeSelection(resolvedPos);
                transaction = transaction.setSelection(nodeSelection);
                view.dispatch(transaction);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        };

        outer.appendChild(handle);
        outer.appendChild(img);

        this.dom = outer;
        this.img = img;
        this.handle = handle;
    }

    selectNode() {
        this.img.classList.add("ProseMirror-selectednode");

        this.handle.style.display = "";
    }

    deselectNode() {
        this.img.classList.remove("ProseMirror-selectednode");

        this.handle.style.display = "none";
    }
}

let placeholderPlugin = new Plugin({
    state: {
        init() {
            return DecorationSet.empty;
        },
        apply(tr: Transaction, set: DecorationSet) {
            // Adjust decoration positions to changes made by the transaction
            set = set.map(tr.mapping, tr.doc);
            // See if the transaction adds or removes any placeholders
            let action = tr.getMeta("plugin$");
            if (action && action.add) {
                let widget = document.createElement("placeholder");
                let deco = Decoration.widget(action.add.pos, widget, {
                    id: action.add.id
                });
                set = set.add(tr.doc, [deco]);
            } else if (action && action.remove) {
                set = set.remove(
                    set.find(undefined, undefined, (spec) => spec.id === action.remove.id)
                );
            }
            return set;
        }
    },
    props: {
        decorations(state) {
            return this.getState(state);
        }
    }
});

function findPlaceholder(state: EditorState, id: {}) {
    let decos: DecorationSet | undefined = placeholderPlugin.getState(state);

    if (decos === undefined) return  null;

    let found = decos.find(undefined, undefined, (spec: { id: string }) => spec.id === id);
    return found.length ? found[0].from : null;
}

const mySchema = new Schema({
    nodes: { ...nodes, resizableImage },
    marks: schema.spec.marks
});

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

function startImageUpload(view: EditorView, file: Blob) {
    // 이 업로드의 ID 역할을 할 새로운 개체 A fresh object to act as the ID for this upload
    let id = {};

    // 선택 항목을 자리 표시자로 바꿈 Replace the selection with a placeholder
    let tr = view.state.tr;

    if (!tr.selection.empty) tr.deleteSelection();
    tr.setMeta(placeholderPlugin, { add: { id, pos: tr.selection.from } });
    view.dispatch(tr);

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
}

function Prosemirror(props: any) {
    const editorRef = createRef<HTMLDivElement>();
    const [view, setView] = useState<EditorView>();
    const contentRef = createRef<HTMLDivElement>();
    const imageUploadRef = createRef<HTMLInputElement>();

    useEffect(() => {
        // initial render
        const editorState = EditorState.create({
            doc: DOMParser.fromSchema(mySchema).parse(contentRef.current!),
            schema: mySchema,
            // doc: ProsemirrorNode.fromJSON(schema, {
            //   type: "doc",
            //   content: [{ type: "paragraph" }]
            // }),
            plugins: exampleSetup( { schema } ).concat([
                placeholderPlugin,
                reactProps(props)
            ])
        });

        setView(
            new EditorView(editorRef.current!, {
                state: editorState,
                nodeViews: {
                    resizableImage: function (node, view, getPos) {
                        return new FootnoteView(node, view, getPos as () => number);
                    }
                }
            })
        );
        console.log('editorRef', editorRef)
    }, []);

    useEffect(() => {
        if (view) {
            imageUploadRef.current?.addEventListener("change", (e) => {
                const target = e.target as HTMLInputElement;
                if (
                    view?.state.selection.$from.parent.inlineContent &&
                    target.files?.length
                ) {
                    startImageUpload(view, target.files[0]);

                }
                view?.focus();
            });

            imageUploadRef.current?.addEventListener(
                "click",
                (e: Event) => ((e.target as HTMLInputElement).value = "")
            );

            return () => view?.destroy();
        }
        console.log('view', view);
    }, [ imageUploadRef ]);

    useEffect(() => {
        // every render
        const tr = view?.state.tr.setMeta(reactPropsKey, props);
        if (tr) view?.dispatch(tr);
    });
    return (
        <div>
            <div>
                Insert Image:{" "}
                <input type="file" accept="image/*" className="imageUpload" ref={imageUploadRef}/>
            </div>
            <div ref={editorRef} style={{width: "100%", height: "500px"}}></div>
            <div ref={contentRef} style={{ display: "none" }}>

                <StyledDiv className="test-div"></StyledDiv>
            </div>
        </div>
    );
}

export default Prosemirror;
