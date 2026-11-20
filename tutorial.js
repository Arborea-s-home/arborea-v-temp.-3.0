// tutorial.js
const TUTORIAL_STORAGE_KEY = 'arborea_tutorial_seen_v1';

export class Tutorial {
  constructor() {
    // Appena parte, segna come "visto" così non si riapre ai reload successivi
    try { localStorage.setItem(TUTORIAL_STORAGE_KEY, '1'); } catch {}

    this.steps = [
      {
        title: 'Benvenuto in ARBOREA',
        content: 'L’atlante raccoglie dati archeobotanici georeferenziati dell’Italia centrale. <strong>Apri WebGIS</strong> per esplorare tutte le schede.',
        target: '#atlas-webgis',
        position: 'center'
      },
      {
        title: 'Regioni e province',
        content: 'Usa <strong>Regioni</strong> e <strong>Province</strong> sulla mappa per cambiare l’unità di aggregazione. La legenda indica quanti siti ricadono in ogni area.',
        target: '.atlas-boundary',
        position: 'left'
      },
      {
        title: 'Tipologie di contesto',
        content: 'Premi una barra per escludere o reincludere la tipologia. La sua lunghezza riflette la quantità di siti nel periodo selezionato.',
        target: '#ambito-buttons',
        position: 'right'
      },
      {
        title: 'Distribuzione ed elenco',
        content: 'In <strong>Distribuzione</strong>, seleziona una fetta o una voce in legenda per passare dalle regioni alle province. In <strong>Elenco</strong>, ciascun segmento apre i siti di una provincia. Usa i link alle schede per aprire il WebGIS con il filtro corrispondente.',
        target: '#mapped-sites-list .atlas-mode',
        position: 'right'
      },
      {
        title: 'Cronologia',
        content: 'Sposta i due cursori o seleziona un periodo dall’asse per restringere l’intervallo. Attiva <strong>Includi siti non datati</strong> per includere anche i siti senza una fase riconosciuta.',
        target: '#timeline-container',
        position: 'top'
      },
      {
        title: 'Schede e informazioni sul progetto',
        content: 'Clicca un’area sulla mappa per aprire il confronto con le altre aree. <strong>Full Details</strong> apre la scheda di dettaglio. Il logo in testata porta alle informazioni sul progetto.',
        target: '#atlas-project-link',
        position: 'center'
      }
    ];

    this.currentStep = 0;
    this.init();
  }

  init() {
    this.previousFocus = document.activeElement;
    this.createTutorialElements();
    this.showStep(0);
    this.keyHandler = this.handleKeyPress.bind(this);
    document.addEventListener('keydown', this.keyHandler);
    this.tutorialBox.focus();
  }

  createTutorialElements() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';

    this.highlightBox = document.createElement('div');
    this.highlightBox.className = 'tutorial-highlight';

    this.tutorialBox = document.createElement('div');
    this.tutorialBox.className = 'tutorial-box';
    this.tutorialBox.setAttribute('role', 'dialog');
    this.tutorialBox.setAttribute('aria-modal', 'true');
    this.tutorialBox.setAttribute('aria-labelledby', 'atlas-tutorial-title');
    this.tutorialBox.tabIndex = -1;

    this.tutorialTitle = document.createElement('h3');
    this.tutorialTitle.className = 'tutorial-title';
    this.tutorialTitle.id = 'atlas-tutorial-title';

    this.tutorialContent = document.createElement('div');
    this.tutorialContent.className = 'tutorial-content';


    this.tutorialNav = document.createElement('div');
    this.tutorialNav.className = 'tutorial-nav';

    this.prevButton = document.createElement('button');
    this.prevButton.className = 'tutorial-button tutorial-prev';
    this.prevButton.innerHTML = '&larr; Indietro';
    this.prevButton.addEventListener('click', () => this.prevStep());

    this.nextButton = document.createElement('button');
    this.nextButton.className = 'tutorial-button tutorial-next';
    this.nextButton.innerHTML = 'Avanti &rarr;';
    this.nextButton.addEventListener('click', () => this.nextStep());

    this.closeButton = document.createElement('button');
    this.closeButton.className = 'tutorial-button tutorial-close';
    this.closeButton.innerHTML = 'Chiudi';
    this.closeButton.addEventListener('click', () => this.close());

    this.tutorialNav.appendChild(this.prevButton);
    this.tutorialNav.appendChild(this.nextButton);
    this.tutorialNav.appendChild(this.closeButton);

    this.tutorialBox.appendChild(this.tutorialTitle);
    this.tutorialBox.appendChild(this.tutorialContent);
    this.tutorialBox.appendChild(this.tutorialNav);

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.highlightBox);
    document.body.appendChild(this.tutorialBox);
  }

  showStep(stepIndex) {
    clearTimeout(this.highlightTimer);
    this.currentStep = stepIndex;
    const step = this.steps[stepIndex];

    this.tutorialTitle.textContent = step.title;
    this.tutorialContent.innerHTML = step.content;

    this.positionTutorialBox(step.position);

    if (step.target) {
      const targetElement = document.querySelector(step.target);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.highlightTimer = setTimeout(() => this.highlightElement(targetElement), 350);
      } else {
        this.hideHighlight();
      }
    } else {
      this.hideHighlight();
    }

    this.prevButton.disabled = stepIndex === 0;
    this.nextButton.innerHTML = stepIndex === this.steps.length - 1 ? 'Fine' : 'Avanti &rarr;';
  }

  positionTutorialBox(position) {
    this.tutorialBox.style.right = '';
    this.tutorialBox.style.left = '';
    this.tutorialBox.style.top = '';
    this.tutorialBox.style.transform = '';

    switch (position) {
      case 'top':
        this.tutorialBox.style.top = '20px';
        this.tutorialBox.style.left = '50%';
        this.tutorialBox.style.transform = 'translateX(-50%)';
        break;
      case 'right':
        this.tutorialBox.style.top = '50%';
        this.tutorialBox.style.right = '20px';
        this.tutorialBox.style.transform = 'translateY(-50%)';
        break;
      case 'left':
        this.tutorialBox.style.top = '50%';
        this.tutorialBox.style.left = '20px';
        this.tutorialBox.style.transform = 'translateY(-50%)';
        break;
      case 'center':
      default:
        this.tutorialBox.style.top = '50%';
        this.tutorialBox.style.left = '50%';
        this.tutorialBox.style.transform = 'translate(-50%, -50%)';
    }
  }

  highlightElement(element) {
    const rect = element.getBoundingClientRect();

    this.highlightBox.style.width = `${rect.width + 20}px`;
    this.highlightBox.style.height = `${rect.height + 20}px`;
    this.highlightBox.style.top = `${rect.top - 10}px`;
    this.highlightBox.style.left = `${rect.left - 10}px`;
    this.highlightBox.style.opacity = '1';

    const tutorialRect = this.tutorialBox.getBoundingClientRect();
    const highlightRect = this.highlightBox.getBoundingClientRect();
    this.highlightBox.className = 'tutorial-highlight';
    if (tutorialRect.left > highlightRect.right) {
      this.highlightBox.classList.add('arrow-right');
    } else if (tutorialRect.right < highlightRect.left) {
      this.highlightBox.classList.add('arrow-left');
    } else if (tutorialRect.top > highlightRect.bottom) {
      this.highlightBox.classList.add('arrow-bottom');
    } else {
      this.highlightBox.classList.add('arrow-top');
    }
  }

  hideHighlight() { this.highlightBox.style.opacity = '0'; }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) this.showStep(this.currentStep + 1);
    else this.close();
  }
  prevStep() { if (this.currentStep > 0) this.showStep(this.currentStep - 1); }

  close() {
    document.removeEventListener('keydown', this.keyHandler);
    clearTimeout(this.highlightTimer);
    this.previousFocus?.focus({ preventScroll: true });
    try { localStorage.setItem(TUTORIAL_STORAGE_KEY, '1'); } catch {}
    this.overlay.style.opacity = '0';
    this.highlightBox.style.opacity = '0';
    this.tutorialBox.style.opacity = '0';
    setTimeout(() => {
      this.overlay.remove();
      this.highlightBox.remove();
      this.tutorialBox.remove();
    }, 300);
  }

  handleKeyPress(e) {
    if (e.key === 'Tab') {
      const buttons = [...this.tutorialNav.querySelectorAll('button:not(:disabled)')];
      const edge = e.shiftKey ? buttons[0] : buttons.at(-1);
      if (document.activeElement === edge || document.activeElement === this.tutorialBox) {
        e.preventDefault();
        (e.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
      }
      return;
    }
    if (e.key === 'ArrowRight') this.nextStep();
    else if (e.key === 'ArrowLeft') this.prevStep();
    else if (e.key === 'Escape') this.close();
  }
}
