import Editor, { useMonaco } from "@monaco-editor/react";
import { error } from "lib0";
import { createMutex } from "lib0/mutex";
import { editor as MonacoEditor } from "monaco-editor";
import { useEffect, useRef } from "react";
import { WebPubSubSyncClient } from "y-azure-webpubsub-dev";
import { Doc } from "yjs";

const DEFAULT_CODE = "";

export function CodeEditor(props: {
  language: string;
  username: string;
  chanId: string;
  url: string;
}) {
  const editorRef = useRef<MonacoEditor.ICodeEditor | null>(null);
  const monaco = useMonaco();

  const code = DEFAULT_CODE;

  const options = {
    selectOnLineNumbers: true,
    lineNumbersMinChars: 15,
    readOnly: false,
  };

  function onEditorMount(editor: MonacoEditor.ICodeEditor) {
    editorRef.current = editor;
    editor.focus();
  }

  useEffect(() => {
    if (
      monaco === null ||
      editorRef.current === null ||
      props.chanId === "" ||
      props.url === ""
    ) {
      return;
    }

    const ydoc = new Doc();
    const ytext = ydoc.getText("monaco");

    let provider = new WebPubSubSyncClient(props.url, props.chanId, ydoc);
    provider.start();

    const textModel = editorRef?.current?.getModel();
    if (textModel == null) {
      return;
    }

    let mux = createMutex();

    let textObserver = (event: { delta: any[] }) => {
      let index = 0;

      event.delta.forEach((op) => {
        mux(() => {
          if (op.retain !== undefined) {
            index += op.retain;
          } else if (op.insert !== undefined) {
            const pos = textModel.getPositionAt(index);
            const range = new monaco.Range(
              pos.lineNumber,
              pos.column,
              pos.lineNumber,
              pos.column
            );
            textModel.applyEdits([{ range, text: op.insert }]);
            index += op.insert.length;
          } else if (op.delete !== undefined) {
            const pos = textModel.getPositionAt(index);
            const endPos = textModel.getPositionAt(index + op.delete);
            const range = new monaco.Range(
              pos.lineNumber,
              pos.column,
              endPos.lineNumber,
              endPos.column
            );
            textModel.applyEdits([{ range, text: "" }]);
          } else {
            throw error.unexpectedCase();
          }
        });
      });
    };

    ytext.observe(textObserver);
    {
      const ytextValue = ytext.toString();
      if (textModel.getValue() !== ytextValue) {
        textModel.setValue(ytextValue);
      }
    }

    textModel.onDidChangeContent((event) => {
      mux(() => {
        // apply changes from right to left
        ydoc.transact(() => {
          event.changes
            .sort(
              (change1, change2) => change2.rangeOffset - change1.rangeOffset
            )
            .forEach((change) => {
              ytext.delete(change.rangeOffset, change.rangeLength);
              ytext.insert(change.rangeOffset, change.text);
            });
        }, null);
      });
    });
  }, [monaco, props.chanId, props.url]);

  return (
    <div className="editor">
      <Editor
        width="100%"
        height="100%"
        theme="vs-dark"
        language={props.language}
        value={code}
        options={options}
        onMount={onEditorMount}
      />
    </div>
  );
}
