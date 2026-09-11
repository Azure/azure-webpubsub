/**
 * 时间格式化工具函数
 */

/**
 * 格式化消息时间戳为可读的显示格式
 * @param timestamp UTC时间字符串，格式如 "2025-12-29T08:55:56.3377841Z"
 * @returns 格式化后的时间字符串
 */
export function formatMessageTime(timestamp: string): string {
  const messageDate = new Date(timestamp);
  const now = new Date();
  
  // 获取当地时间的日期部分，去除时间部分
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  
  // 计算时间差（以天为单位）
  const diffTime = today.getTime() - messageDay.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // 获取本周开始时间（周一）
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday (0) to 6, others to dayOfWeek - 1
  startOfWeek.setDate(today.getDate() - mondayOffset);
  
  // 格式化时间部分
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  const timeString = messageDate.toLocaleTimeString('en-US', timeOptions);
  
  if (diffDays === 0) {
    // 今天：只显示时间
    return timeString;
  } else if (messageDay >= startOfWeek) {
    // 本周内：显示星期几 + 时间
    const weekdayOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long'
    };
    const weekdayString = messageDate.toLocaleDateString('en-US', weekdayOptions);
    return `${weekdayString} ${timeString}`;
  } else {
    // 本周之前：显示月/日 + 时间
    const month = messageDate.getMonth() + 1;
    const day = messageDate.getDate();
    return `${month}/${day} ${timeString}`;
  }
}

/**
 * 格式化消息时间戳为完整的显示格式（用于hover tooltip）
 * @param timestamp UTC时间字符串，格式如 "2025-12-29T08:55:56.3377841Z"
 * @returns 完整格式的时间字符串，如 "Tuesday, December 29, 2025 11:24:35 AM"
 */
export function formatFullMessageTime(timestamp: string): string {
  const messageDate = new Date(timestamp);
  
  const fullOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };
  
  return messageDate.toLocaleDateString('en-US', fullOptions);
}