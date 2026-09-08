export async function orTimeout(task, millisecondsDelay = 5000) {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('TimeoutException')), millisecondsDelay));
  await Promise.race([task, timeout]);
}
