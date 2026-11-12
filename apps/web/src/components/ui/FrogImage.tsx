export default function FrogImage(props: { class: string; pose: "closed" | "open" }) {
    const name = props.pose === "open" ? "sapo-frog-open" : "sapo-frog";
    const height = props.pose === "open" ? 914 : 800;
    return (
        <>
            <img
                class={`${props.class} frog-light`}
                src={`/app/images/${name}.svg`}
                alt=""
                width={929}
                height={height}
            />
            <img
                class={`${props.class} frog-dark`}
                src={`/app/images/${name}-dark.svg`}
                alt=""
                width={929}
                height={height}
            />
        </>
    );
}
