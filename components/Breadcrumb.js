import EventBus from '../core/EventBus.js';
import Router from '../core/Router.js';
import { iconSvg } from '../core/IconLibrary.js';
import { showActionMenu } from '../core/ActionMenu.js';

export default class Breadcrumb {
  constructor() {
    this.element = document.getElementById('breadcrumb');
    EventBus.on('navigate', () => this.render());
    new ResizeObserver(() => this.render()).observe(this.element);
    document.fonts?.ready.then(() => this.render());
    this.render();
  }

  render() {
    const path = Router.getPath(),
      measure = document.createElement('div');
    measure.className = 'breadcrumb breadcrumb-measure';
    const append = (container, item, index, current) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'breadcrumb-item' + (current ? ' active' : '');
      button.textContent = item.title;
      button.title = item.title;
      if (current) button.setAttribute('aria-current', 'page');
      button.onclick = () => Router.goToIndex(index);
      container.appendChild(button);
    };
    path.forEach((item, index) => append(measure, item, index, index === path.length - 1));
    document.body.appendChild(measure);
    const collapse =
      path.length > 1 && measure.scrollWidth + (path.length - 1) * 17 > this.element.clientWidth;
    measure.remove();
    this.element.replaceChildren();
    if (collapse) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'toolbar-icon-btn path-trigger';
      more.innerHTML = iconSvg('ellipsis');
      more.setAttribute('aria-label', '完整路径');
      more.setAttribute('aria-haspopup', 'menu');
      more.setAttribute('aria-expanded', 'false');
      more.onclick = () =>
        showActionMenu(
          more,
          path.map((item, index) => ({
            icon: 'folder',
            label: item.title,
            action: () => Router.goToIndex(index)
          })),
          '当前位置'
        );
      this.element.appendChild(more);
      append(this.element, path.at(-1), path.length - 1, true);
    } else
      path.forEach((item, index) => {
        if (index) {
          const separator = document.createElement('span');
          separator.className = 'breadcrumb-separator';
          separator.innerHTML = iconSvg('chevron-right');
          this.element.appendChild(separator);
        }
        append(this.element, item, index, index === path.length - 1);
      });
    this.element.classList.add('visible');
  }
}
