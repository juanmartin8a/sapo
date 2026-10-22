import PageHeading from "./PageHeading";
export default function SupportPage() {
    return (
        <div class="support-page">
            <section aria-label="Support">
                <PageHeading title="Need a hand with SAPO?" />
                <p class="page-intro">
                    {" Leave us an email at "}
                    <a href="mailto:support@sapo.surf?subject=SAPO%20Support">
                        {"support@sapo.surf"}
                    </a>
                    {". "}
                </p>
                <div class="support-actions">
                    <a class="resource-link" href="mailto:support@sapo.surf?subject=SAPO%20Support">
                        {"Email support "}
                        <span aria-hidden="true">{"↗"}</span>
                    </a>
                </div>
            </section>
        </div>
    );
}
