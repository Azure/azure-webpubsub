import React, { useEffect, useState } from "react";
import MarkdownIt from "markdown-it";
import { Tab, TabList } from "@fluentui/react-components";
import type { TabValue } from "@fluentui/react-components";

// Non greedy
const regex = /(?<=^|\n)#\s+(.+)\r?\n([\s\S]+?)(?=\n# |$)/g;

const CodeTabs = ({ className }: { className?: string | undefined }) => {
  const [markdownContent, setMarkdownContent] = useState("");

  const [htmlSections, setHtmlSections] = useState<{ title: string; html: string }[]>([]);
  useEffect(() => {
    // Load your Markdown file here (e.g., via fetch or import)
    // For example, using fetch:
    fetch(process.env.PUBLIC_URL + "/sample.md")
      .then((response) => response.text())
      .then((data) => {
        setMarkdownContent(data);
      });
  }, []);

  useEffect(() => {
    if (markdownContent) {
      // use regex to seperate the markdown content into sections with h1 as the group name
      const sections: { title: string; html: string }[] = [];
      const md = new MarkdownIt();

      let match;
      while ((match = regex.exec(markdownContent)) !== null) {
        const header = match[1];
        const content = match[2];
        sections.push({ title: header, html: md.render(content) });
      }
      setHtmlSections(sections);
    }
  }, [markdownContent]);

  const [selectedValue, setSelectedValue] = React.useState<TabValue>(0);

  return (
    htmlSections.length > 0 && (
      <div className={className}>
        <TabList selectedValue={selectedValue} onTabSelect={(_, d) => setSelectedValue(d.value)}>
          {htmlSections.map((section, index) => (
            <Tab key={index} value={index}>
              {section.title}
            </Tab>
          ))}
        </TabList>
        <div className="m-2 p-2 bg-light overflow-auto" dangerouslySetInnerHTML={{ __html: htmlSections[selectedValue as any].html }} />
      </div>
    )
  );
};

export default React.memo(CodeTabs);
