import Editor, { useMonaco } from "@monaco-editor/react";
import { editor as MonacoEditor } from "monaco-editor";
import { useEffect, useRef } from "react";
import { MonacoBinding } from "y-monaco";
import { WebPubSubSyncClient } from "y-azure-webpubsub-client";
import { Doc } from "yjs";

const DEFAULT_CODE = "";

export function CodeEditor(props: {
  language: string;
  username: string;
  chanId: string;
  url: string;
}) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monaco = useMonaco();

  const code = DEFAULT_CODE;

  const options : MonacoEditor.IEditorOptions = {
    selectOnLineNumbers: true,
    lineNumbers: 'off',
    lineNumbersMinChars: 15,
    readOnly: false,
  };

  function onEditorMount(editor: MonacoEditor.IStandaloneCodeEditor) {
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
      client.awareness
    );
    console.log(monacoBinding);
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
