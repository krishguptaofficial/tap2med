const mobileMenuButton =
    document.getElementById("mobile-menu-button");

const siteNav =
    document.querySelector(".site-nav");

const headerActions =
    document.querySelector(".header-actions");

if (mobileMenuButton && siteNav) {
    mobileMenuButton.addEventListener(
        "click",
        () => {
            const isOpen =
                mobileMenuButton.getAttribute(
                    "aria-expanded"
                ) === "true";

            mobileMenuButton.setAttribute(
                "aria-expanded",
                String(!isOpen)
            );

            siteNav.classList.toggle(
                "mobile-open",
                !isOpen
            );

            if (headerActions) {
                headerActions.classList.toggle(
                    "mobile-open",
                    !isOpen
                );
            }
        }
    );
}

document
    .querySelectorAll(".site-nav a, .header-actions a")
    .forEach((link) => {
        link.addEventListener("click", () => {
            if (!mobileMenuButton) {
                return;
            }

            mobileMenuButton.setAttribute(
                "aria-expanded",
                "false"
            );

            siteNav?.classList.remove(
                "mobile-open"
            );

            headerActions?.classList.remove(
                "mobile-open"
            );
        });
    });