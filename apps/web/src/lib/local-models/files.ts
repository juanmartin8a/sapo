export async function validateModelFiles(input: readonly File[]): Promise<File[]> {
    const files = [...input].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    if (!files.length) throw new Error("Choose a GGUF model.");
    const shard = /^(.*)-(\d{5})-of-(\d{5})\.gguf$/i;
    const first = files[0].name.match(shard);
    if (first) {
        const total = Number(first[3]);
        if (
            files.length !== total ||
            files.some((file, index) => {
                const match = file.name.match(shard);
                return (
                    !match ||
                    match[1] !== first[1] ||
                    Number(match[2]) !== index + 1 ||
                    Number(match[3]) !== total
                );
            })
        )
            throw new Error("Select every numbered GGUF shard of the same model together.");
    } else if (files.length !== 1) {
        throw new Error(
            "Add one model at a time. For a split model, select all its numbered GGUF shards together.",
        );
    }
    for (const file of files) {
        if (!file.name.toLowerCase().endsWith(".gguf") || file.size < 8)
            throw new Error("Choose a non-empty GGUF model file.");
        if (file.size >= 2 ** 31)
            throw new Error(
                "Each GGUF file must be smaller than 2 GB. Use a model split into smaller GGUF shards.",
            );
        const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        if (String.fromCharCode(...magic) !== "GGUF")
            throw new Error(`${file.name} is not a valid GGUF file.`);
    }
    return files;
}
