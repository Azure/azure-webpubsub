import Editor, { useMonaco } from "@monaco-editor/react";
import { error } from "lib0";
import { createMutex } from "lib0/mutex";
import { editor as MonacoEditor } from "monaco-editor";
import { useEffect, useRef } from "react";
import { WebPubSubSyncClient } from "y-azure-webpubsub-dev";
import { MonacoBinding } from "y-monaco";
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

    let client = new WebPubSubSyncClient(props.url, props.chanId, ydoc);
    client.start();

    const textModel = editorRef?.current?.getModel();
    if (textModel == null) {
      return;
    }

    const monacoBinding = new MonacoBinding(
      ytext,
      textModel,
      new Set([editorRef.current]),
      undefined // TODO awareness support
    );
  });

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
