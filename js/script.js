const fadeElements = document.querySelectorAll(".fade-in");

if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("show");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    fadeElements.forEach((element) => observer.observe(element));
} else {
    fadeElements.forEach((element) => element.classList.add("show"));
}

const currentPage = document.body.dataset.page;
const navLinks = document.querySelectorAll("nav a[data-page]");

if (currentPage) {
    const updateActiveNavigation = () => {
        const activePage = currentPage === "ia" && window.location.hash === "#ia-programacao"
            ? "ia-programacao"
            : currentPage;

        navLinks.forEach((link) => {
            link.classList.remove("is-active");
            link.removeAttribute("aria-current");

            if (link.dataset.page !== activePage) {
                return;
            }

            link.classList.add("is-active");
            link.setAttribute("aria-current", "page");
        });
    };

    updateActiveNavigation();
    window.addEventListener("hashchange", updateActiveNavigation);
}

if ("serviceWorker" in navigator && ["http:", "https:"].includes(window.location.protocol)) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js").catch(() => {
            // O site continua funcionando normalmente se o navegador bloquear o PWA.
        });
    });
}
