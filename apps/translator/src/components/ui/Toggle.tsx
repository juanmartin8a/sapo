export default function Toggle(props: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <label class="toggle-row">
            <span>
                <span class="toggle-label">{props.label}</span>
                {props.description && (
                    <span class="toggle-description">{props.description}</span>
                )}
            </span>
            <input
                type="checkbox"
                role="switch"
                class="toggle-input"
                checked={props.checked}
                disabled={props.disabled}
                onChange={(event) =>
                    props.onChange(event.currentTarget.checked)
                }
            />
        </label>
    );
}
