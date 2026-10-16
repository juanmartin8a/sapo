import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { beginFrogTransition, waitForFrogTransition } from './frogTransition.ts';

test('mouth animation waits until navigation finishes', async () => {
	const finish = beginFrogTransition();
	let ready = false;
	const waiting = waitForFrogTransition().then(() => {
		ready = true;
	});
	await setImmediate();
	assert.equal(ready, false);
	finish();
	await waiting;
	assert.equal(ready, true);
});

test('an interrupted transition cannot release animation during the next navigation', async () => {
	const finishFirst = beginFrogTransition();
	let ready = false;
	const waiting = waitForFrogTransition().then(() => {
		ready = true;
	});
	const finishSecond = beginFrogTransition();
	finishFirst();
	await setImmediate();
	assert.equal(ready, false);
	finishSecond();
	await waiting;
	assert.equal(ready, true);
});

test('animation can start immediately when no transition is pending', async () => {
	await waitForFrogTransition();
});
