export default function FrogImage(props: {
    src: string;
    class: string;
    pose: "closed" | "open";
    width: number;
    height: number;
}) {
    return (
        <>
            <img
                class={props.class}
                src={props.src}
                alt=""
                width={props.width}
                height={props.height}
            />
            <img
                class={`${props.class} frog-eye frog-eye-${props.pose}`}
                src={props.src}
                alt=""
                aria-hidden="true"
                width={props.width}
                height={props.height}
            />
        </>
    );
}
