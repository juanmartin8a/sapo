// Coordinate route transitions with the frog's live mouth animation.
let pendingTransition = Promise.resolve();

export function beginFrogTransition(): () => void {
	let finish!: () => void;
	pendingTransition = new Promise<void>((resolve) => {
		finish = resolve;
	});
	return finish;
}

export async function waitForFrogTransition(): Promise<void> {
	let transition: Promise<void>;
	do {
		transition = pendingTransition;
		await transition;
	} while (transition !== pendingTransition);
}

export async function waitForFrogImages(): Promise<void> {
	await Promise.allSettled(
		Array.from(document.querySelectorAll<HTMLImageElement>('.sapo-frog-transition img')).map(
			(image) => image.decode()
		)
	);
}
