import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
  silent: true
});

// Check if content appears to be HTML (from rich text editor)
const isHtmlContent = (content: string): boolean => {
  // Check for common HTML tags that would come from the rich text editor
  const htmlPattern = /<(div|span|p|br|b|i|u|s|strong|em|code|a|ul|ol|li|blockquote)[^>]*>/i;
  return htmlPattern.test(content);
};

export const formatMessageContent = (content: string): string => {
  if (!content) return '';

  try {
    // If content is HTML (from rich text editor), sanitize and return directly
    if (isHtmlContent(content)) {
      return DOMPurify.sanitize(content, {
        ADD_ATTR: ['target'],
        ALLOWED_TAGS: ['div', 'span', 'p', 'br', 'b', 'i', 'u', 's', 'strong', 'em', 
                       'code', 'pre', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3'],
        ALLOWED_ATTR: ['href', 'target', 'style', 'class']
      });
    }

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
