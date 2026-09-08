const mobileMenuButton = document.getElementById("mobile-menu-button");
const siteNav = document.querySelector(".site-nav");
const headerActions = document.querySelector(".header-actions");

function closeMenu() {
  mobileMenuButton?.setAttribute("aria-expanded", "false");
  siteNav?.classList.remove("mobile-open");
  headerActions?.classList.remove("mobile-open");
  mobileMenuButton?.classList.remove("is-open");
}

if (mobileMenuButton && siteNav) {
  mobileMenuButton.addEventListener("click", () => {
    const isOpen = mobileMenuButton.getAttribute("aria-expanded") === "true";

    mobileMenuButton.setAttribute("aria-expanded", String(!isOpen));
    siteNav.classList.toggle("mobile-open", !isOpen);
    headerActions?.classList.toggle("mobile-open", !isOpen);
    mobileMenuButton.classList.toggle("is-open", !isOpen);
  });
}

document.querySelectorAll(".site-nav a, .header-actions a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

document.addEventListener("click", (event) => {
  if (
    mobileMenuButton &&
    !mobileMenuButton.contains(event.target) &&
    !siteNav?.contains(event.target)
  ) {
    closeMenu();
  }
});

const progressBar = document.createElement("div");

progressBar.setAttribute("aria-hidden", "true");

progressBar.style.cssText = `
  position: fixed;
  top: 0;
  left: 0;
  height: 2px;
  width: 0%;
  background: var(--color-accent, #1a7a5e);
  z-index: 9999;
  transition: width 0.1s linear;
  pointer-events: none;
`;

document.body.prepend(progressBar);

window.addEventListener("scroll", () => {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const percentage = docHeight> 0 ? (scrollTop / docHeight) * 100 : 0;

  progressBar.style.width = `${percentage}%`;
}, { passive: true });

const revealTargets = [
  ".workflow-step",
  ".problem-section .narrow-container> *",
  ".doctor-content> *",
  ".doctor-note",
  ".privacy-card> *",
  ".cta-card> *",
  ".trust-inner> *"
];

const revealStyle = document.createElement("style");

revealStyle.textContent = `
  .will-reveal {
    opacity: 0;
    transform: translateY(22px);
    transition: opacity 0.55s ease, transform 0.55s ease;
  }

  .will-reveal.revealed {
    opacity: 1;
    transform: none;
  }

  .workflow-step.will-reveal:nth-child(1) {
    transition-delay: 0ms;
  }

  .workflow-step.will-reveal:nth-child(2) {
    transition-delay: 80ms;
  }

  .workflow-step.will-reveal:nth-child(3) {
    transition-delay: 160ms;
  }

  .workflow-step.will-reveal:nth-child(4) {
    transition-delay: 240ms;
  }

  .mobile-menu-button span {
    transition: transform 0.25s ease, opacity 0.2s ease;
    transform-origin: center;
  }

  .mobile-menu-button.is-open span:nth-child(1) {
    transform: translateY(7px) rotate(45deg);
  }

  .mobile-menu-button.is-open span:nth-child(2) {
    opacity: 0;
    transform: scaleX(0);
  }

  .mobile-menu-button.is-open span:nth-child(3) {
    transform: translateY(-7px) rotate(-45deg);
  }

  .workflow-step {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .workflow-step:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(9, 41, 66, 0.08);
    z-index: 1;
    position: relative;
  }

  .hero-content {
    animation: heroFadeUp 0.7s ease both;
  }

  .hero-visual {
    animation: heroFadeUp 0.7s ease 0.15s both;
  }

  @keyframes heroFadeUp {
    from {
      opacity: 0;
      transform: translateY(28px);
    }

    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .will-reveal,
    .hero-content,
    .hero-visual {
      opacity: 1 !important;
      transform: none !important;
      animation: none !important;
      transition: none !important;
    }
  }
`;

document.head.appendChild(revealStyle);

revealTargets.forEach((selector) => {
  document.querySelectorAll(selector).forEach((element) => {
    element.classList.add("will-reveal");
  });
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: "0px 0px -40px 0px"
  });

  document.querySelectorAll(".will-reveal").forEach((element) => {
    observer.observe(element);
  });
}

const sections = document.querySelectorAll("section[id]");
const navLinks = document.querySelectorAll(".site-nav a[href*='#']");

if (sections.length && navLinks.length && "IntersectionObserver" in window) {
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        navLinks.forEach((link) => {
          link.classList.toggle(
            "nav-active",
            link.getAttribute("href").includes(entry.target.id)
          );
        });
      }
    });
  }, {
    threshold: 0.4
  });

  sections.forEach((section) => {
    navObserver.observe(section);
  });

  const navStyle = document.createElement("style");

  navStyle.textContent = `
    .site-nav a.nav-active {
      color: var(--color-primary) !important;
      font-weight: var(--font-semibold, 600);
    }
  `;

  document.head.appendChild(navStyle);
}

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (event) => {
    const targetSelector = anchor.getAttribute("href");
    const target = document.querySelector(targetSelector);

    if (!target) {
      return;
    }

    event.preventDefault();

    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    closeMenu();
  });
});

const workflowScreens = document.querySelectorAll(".workflow-step-screen");
const workflowIndicators = document.querySelectorAll(".workflow-progress span");
const workflowCaption = document.querySelector(".workflow-caption-text");

const workflowCaptions = [
  "Patient scans the clinic QR",
  "Patient joins the queue",
  "Doctor sees the queue",
  "Prescription is sent"
];

let workflowIndex = 0;
let workflowTimer = null;

function showWorkflowStep(index) {
  workflowScreens.forEach((screen, screenIndex) => {
    screen.classList.toggle("is-active", screenIndex === index);
  });

  workflowIndicators.forEach((indicator, indicatorIndex) => {
    indicator.classList.toggle("active", indicatorIndex === index);
  });

  if (workflowCaption) {
    workflowCaption.textContent = workflowCaptions[index];
  }
}

function startWorkflowAnimation() {
  if (!workflowScreens.length || workflowTimer !== null) {
    return;
  }

  showWorkflowStep(workflowIndex);

  workflowTimer = window.setInterval(() => {
    workflowIndex = (workflowIndex + 1) % workflowScreens.length;
    showWorkflowStep(workflowIndex);
  }, 3000);
}

function stopWorkflowAnimation() {
  if (workflowTimer !== null) {
    window.clearInterval(workflowTimer);
    workflowTimer = null;
  }
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (prefersReducedMotion.matches) {
  showWorkflowStep(0);
} else {
  startWorkflowAnimation();
}

if (typeof prefersReducedMotion.addEventListener === "function") {
  prefersReducedMotion.addEventListener("change", (event) => {
    if (event.matches) {
      stopWorkflowAnimation();
      showWorkflowStep(0);
    } else {
      startWorkflowAnimation();
    }
  });
}