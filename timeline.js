const PHASE_LABELS = {
  'Età del Bronzo': 'Età del Bronzo',
  'Età del Ferro / Villanoviano': 'Ferro / Villanoviano',
  'Periodo Etrusco / Orientalizzante': 'Etrusco / Orientalizzante',
  'Periodo Arcaico (Roma)': 'Arcaico romano',
  'Periodo Repubblicano (Roma)': 'Repubblica',
  'Periodo Imperiale (Roma)': 'Impero',
  'Periodo Moderno': 'Età moderna'
};

export class Timeline {
  constructor(mapManager) {
    this.mapManager = mapManager;
    this.PHASES = mapManager.PHASES;
    this.container = document.getElementById('timeline-container');
    this.barsWrap = this.container.querySelector('.timeline-bars');
    this.axisWrap = this.container.querySelector('.timeline-axis');
    this.inputFrom = document.getElementById('timeline-from');
    this.inputTo = document.getElementById('timeline-to');
    this.labelFrom = document.getElementById('timeline-label-from');
    this.labelTo = document.getElementById('timeline-label-to');
    const last = this.PHASES.length - 1;

    this.container.style.setProperty('--phase-count', this.PHASES.length);
    this.PHASES.forEach((phase, index) => {
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.className = 'timeline-tick';
      tick.textContent = PHASE_LABELS[phase] ?? phase;
      tick.addEventListener('click', () => {
        const from = Number(this.inputFrom.value);
        this.inputFrom.value = Math.min(from, index);
        this.inputTo.value = Math.max(from, index);
        this.commitRange();
      });
      this.axisWrap.append(tick);
    });

    for (const slider of [this.inputFrom, this.inputTo]) {
      slider.min = 0;
      slider.max = last;
      slider.addEventListener('input', () => {
        if (Number(this.inputFrom.value) > Number(this.inputTo.value)) {
          slider.value = slider === this.inputFrom ? this.inputTo.value : this.inputFrom.value;
        }
        this.syncRange();
      });
      slider.addEventListener('change', () => this.commitRange());
    }
    this.inputFrom.value = mapManager.chronoFrom;
    this.inputTo.value = mapManager.chronoTo;
    document.getElementById('timeline-undated').addEventListener('change', event => {
      mapManager.setIncludeUndated(event.target.checked);
    });
    document.addEventListener('map:results-change', () => this.updateBars());
    this.updateBars();
  }

  syncRange() {
    const from = Number(this.inputFrom.value);
    const to = Number(this.inputTo.value);
    const last = Math.max(1, this.PHASES.length - 1);
    this.container.style.setProperty('--range-start', from / last * 100 + '%');
    this.container.style.setProperty('--range-end', to / last * 100 + '%');
    this.labelFrom.textContent = this.PHASES[from];
    this.labelTo.textContent = this.PHASES[to];
    this.inputFrom.setAttribute('aria-valuetext', this.PHASES[from]);
    this.inputTo.setAttribute('aria-valuetext', this.PHASES[to]);
    this.inputFrom.classList.toggle('timeline-front', from > 0 && from === to);
    for (const group of [this.barsWrap.children, this.axisWrap.children]) {
      Array.from(group).forEach((element, index) => {
        element.classList.toggle('in-range', index >= from && index <= to);
      });
    }
  }

  commitRange() {
    this.syncRange();
    this.mapManager.setChronoSelectionByIndices(Number(this.inputFrom.value), Number(this.inputTo.value));
  }

  updateBars() {
    const counts = this.mapManager.computePhaseCounts();
    const max = Math.max(1, ...counts);
    this.barsWrap.replaceChildren(...counts.map((count, i) => {
      const bar = document.createElement('div');
      bar.className = 'timeline-bar';
      bar.style.height = count / max * 100 + '%';
      const description = this.PHASES[i] + ' · ' + count + (count === 1 ? ' sito' : ' siti');
      bar.title = description;
      this.axisWrap.children[i].title = description;
      this.axisWrap.children[i].setAttribute('aria-label', 'Seleziona fino a ' + description);
      return bar;
    }));
    this.syncRange();
  }
}

document.addEventListener('map:data-ready', () => {
  window.timeline = new Timeline(window.mapManager);
}, { once: true });
