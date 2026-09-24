import React, { useCallback, useImperativeHandle, forwardRef, useMemo } from "react";
import "./RichTextEditor.teams.css";
import { Editor } from "roosterjs-content-model-core";
import type { EditorOptions } from "roosterjs-content-model-types";
import { ThemeProvider } from "@fluentui/react/lib/Theme";
import type { PartialTheme } from "@fluentui/react/lib/Theme";
import {
  Rooster,
  Ribbon,
  createRibbonPlugin,
  createEmojiPlugin,
  boldButton,
  italicButton,
  underlineButton,
  strikethroughButton,
  bulletedListButton,
  numberedListButton,
  blockQuoteButton,
  codeButton,
  clearFormatButton,
} from "roosterjs-react";
import { ShortcutPlugin } from "roosterjs-content-model-plugins";

export interface RichTextEditorHandle {
  getHtml: () => string;
  getText: () => string;
  clear: () => void;
  focus: () => void;
  isEmpty: () => boolean;
}

interface RichTextEditorProps {
  placeholder?: string;
  disabled?: boolean;
  canSend?: boolean;
  onSubmit?: () => void;
  onChange?: (hasContent: boolean) => void;
}

// Teams light theme for Fluent UI
const teamsLightTheme: PartialTheme = {
  palette: {
    themePrimary: "#6264a7",
    themeLighterAlt: "#f7f7fb",
    themeLighter: "#e1e1f1",
    themeLight: "#c8c9e4",
    themeTertiary: "#9496c8",
    themeSecondary: "#6769ae",
    themeDarkAlt: "#585a95",
    themeDark: "#4a4c7e",
    themeDarker: "#37385c",
    neutralLighterAlt: "#faf9f8",
    neutralLighter: "#f3f2f1",
    neutralLight: "#edebe9",
    neutralQuaternaryAlt: "#e1dfdd",
    neutralQuaternary: "#d0d0d0",
    neutralTertiaryAlt: "#c8c6c4",
    neutralTertiary: "#a19f9d",
    neutralSecondary: "#605e5c",
    neutralPrimaryAlt: "#3b3a39",
    neutralPrimary: "#323130",
    neutralDark: "#201f1e",
    black: "#000000",
    white: "#ffffff",
  },
};

// Ribbon buttons configuration - Teams-like layout
const ribbonButtons = [
  boldButton,
  italicButton,
  underlineButton,
  strikethroughButton,
  bulletedListButton,
  numberedListButton,
  blockQuoteButton,
  codeButton,
  clearFormatButton,
];


export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  ({ disabled = false, canSend = false, placeholder, onSubmit, onChange }, ref) => {
    // Plugins
    const ribbonPlugin = useMemo(() => createRibbonPlugin(), []);
    const emojiPlugin = useMemo(() => createEmojiPlugin(), []);
    const shortcutPlugin = useMemo(() => new ShortcutPlugin(), []);
    const plugins = useMemo(() => [ribbonPlugin, emojiPlugin, shortcutPlugin], [ribbonPlugin, emojiPlugin, shortcutPlugin]);

    // Rooster imperative handle

    const [editor, setEditor] = React.useState<import("roosterjs-content-model-types").IEditor | null>(null);
    const editorDivRef = React.useRef<HTMLDivElement | null>(null);

    // Use editorCreator to capture editor instance
    const editorCreator = useCallback((div: HTMLDivElement, options?: EditorOptions) => {
      editorDivRef.current = div;
      const ed = new Editor(div, options);
      setEditor(ed);
      return ed;
    }, []);
    
    // Update placeholder when it changes
    React.useEffect(() => {
      if (editorDivRef.current && placeholder) {
        editorDivRef.current.setAttribute('data-placeholder', placeholder);
      }
    }, [placeholder]);

    useImperativeHandle(ref, () => ({
      getHtml: () => editorDivRef.current?.innerHTML || "",
      getText: () => editorDivRef.current?.innerText || "",
      clear: () => { 
        if (editorDivRef.current) {
          editorDivRef.current.innerHTML = "";
        }
      },
      focus: () => editor?.focus?.(),
      isEmpty: () => !(editorDivRef.current?.innerText?.trim()),
    }), [editor]);
    
    // Watch for editor content changes
    React.useEffect(() => {
      if (!editorDivRef.current) return;
      
      const checkContent = () => {
        if (onChange && editorDivRef.current) {
          const text = editorDivRef.current.innerText?.trim() || "";
          onChange(text.length > 0);
        }
      };
      
      const div = editorDivRef.current;
      div.addEventListener('input', checkContent);
      
      return () => {
        div.removeEventListener('input', checkContent);
      };
    }, [onChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (editorDivRef.current && editorDivRef.current.innerText?.trim() && onSubmit) {
          onSubmit();
        }
      }
    }, [onSubmit]);

    // Teams-like theme
    const theme = teamsLightTheme;

    return (
      <ThemeProvider theme={theme}>
        <div className={`rich-text-editor${disabled ? " disabled" : ""}`}> 
          <div className="roosterjs-ribbon">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Ribbon plugin={ribbonPlugin} buttons={ribbonButtons as unknown as import("roosterjs-react").RibbonButton<any>[]} />
          </div>
          <div className="editor-content-wrapper">
            <Rooster
              plugins={plugins}
              onKeyDown={handleKeyDown}
              editorCreator={editorCreator}
            />
            <button
              type="button"
              className={`send-button${canSend ? " enabled" : ""}`}
              onClick={() => onSubmit?.()}
              disabled={!canSend}
              title="Send"
            >
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.01 18L18 10 2.01 2 2 8.5l12 1.5-12 1.5z"/>
              </svg>
            </button>
          </div>
        </div>
      </ThemeProvider>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
