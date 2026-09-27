// Keep input clearance and response artwork based on the same asset dimensions.
export function getTranslationFrogDimensions(screenWidth: number) {
    const width = screenWidth * 0.4;

    return {
        width,
        closedMouthHeight: width * (800 / 929),
        openMouthHeight: width * (914 / 929),
    };
}
