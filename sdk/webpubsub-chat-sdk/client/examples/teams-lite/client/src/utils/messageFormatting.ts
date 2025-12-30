import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
  silent: true
});

export const formatMessageContent = (content: string): string => {
  if (!content) return '';

  try {
    // For short content, use simpler processing for better performance
    if (content.length < 100 && !content.includes('#') && !content.includes('```')) {
      return DOMPurify.sanitize(content.replace(/\n/g, '<br>'), {
        ADD_ATTR: ['target']
      });
    }

    // For longer content, use full markdown processing
    const html = marked.parse(content) as string;
    const sanitized = DOMPurify.sanitize(html, {
      ADD_ATTR: ['target'] // Allow target="_blank" for links
    });

    return sanitized;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    // Fallback to basic text with linebreaks if parsing fails
    return content.replace(/\n/g, '<br>');
  }
};
