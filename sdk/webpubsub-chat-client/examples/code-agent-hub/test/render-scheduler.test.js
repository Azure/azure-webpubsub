import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderScheduler } from '../web-portal/public/js/render-scheduler.js';

describe('render scheduler', () => {
  it('coalesces repeated schedule calls before the next flush', async () => {
    const tasks = [];
    let renderCount = 0;
    const scheduleRender = createRenderScheduler(async () => {
      renderCount += 1;
    }, {
      schedule: (task) => {
        tasks.push(task);
      },
    });

    const pending = Promise.all([scheduleRender(), scheduleRender(), scheduleRender()]);

    assert.equal(tasks.length, 1);
    await tasks.shift()();
    await pending;
    assert.equal(renderCount, 1);
  });

  it('schedules one follow-up pass when more work arrives during a render', async () => {
    const tasks = [];
    let renderCount = 0;
    let releaseFirstRender;
    const firstRenderBlocked = new Promise((resolve) => {
      releaseFirstRender = resolve;
    });

    const scheduleRender = createRenderScheduler(async () => {
      renderCount += 1;
      if (renderCount === 1) {
        scheduleRender();
        await firstRenderBlocked;
      }
    }, {
      schedule: (task) => {
        tasks.push(task);
      },
    });

    const pending = scheduleRender();
    assert.equal(tasks.length, 1);

    const firstFlush = tasks.shift();
    const firstRun = firstFlush();
    await Promise.resolve();
    assert.equal(tasks.length, 0);

    releaseFirstRender();
    await firstRun;
    assert.equal(tasks.length, 1);

    await tasks.shift()();
    await pending;
    assert.equal(renderCount, 2);
  });
});