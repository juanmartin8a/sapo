export default function Toggle(props: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    class?: string;
}) {
    return (
        <label class={`toggle-row ${props.class ?? ""}`}>
            <span>
                <span class="toggle-label">{props.label}</span>
                {props.description && <span class="toggle-description">{props.description}</span>}
            </span>
            <input
                type="checkbox"
                role="switch"
                class="toggle-input"
                checked={props.checked}
                onChange={(event) => props.onChange(event.currentTarget.checked)}
            />
        </label>
    );
}
