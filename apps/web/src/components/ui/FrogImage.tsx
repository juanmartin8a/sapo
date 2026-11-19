export default function FrogImage(props: { class: string; pose: "closed" | "open" }) {
    const open = props.pose === "open";
    const lightAsset = open ? "sapo-frog-open.svg" : "sapo-frog.svg";
    const darkAsset = open ? "sapo-mouth-open-dark.png" : "sapo-dark.png";
    const height = open ? 914 : 800;
    return (
        <>
            <img
                class={`${props.class} frog-light`}
                src={`/app/images/${lightAsset}`}
                alt=""
                width={929}
                height={height}
            />
            <img
                class={`${props.class} frog-dark`}
                src={`/app/images/${darkAsset}`}
                alt=""
                width={929}
                height={height}
            />
        </>
    );
}
