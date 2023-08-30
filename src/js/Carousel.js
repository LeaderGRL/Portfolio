const galleryContainer = document.querySelector('.gallery');
const controller = document.querySelector('.controller');
const controls = ['prev', 'next']
const cards = document.querySelectorAll('.cards');

class Carousel {
    constructor(container, cards, controls) {
        this.container = container;
        this.cards = [...cards];
        this.controls = controls;
    }

    updateGallery() {
        this.cards.forEach(card => {
            card.classList.remove('card-1');
            card.classList.remove('card-2');
            card.classList.remove('card-3');
            card.classList.remove('card-4');
            card.classList.remove('card-5');
        });
        
        this.cards.slice(0, 5).forEach((card, index) => {
            card.classList.add(`card-${index + 1}`);
        });
    }

    setCurrentState(direction) {
        if (direction.className == 'controller-previous'){
            this.cards.unshift(this.cards.pop());
        } else {
            this.cards.push(this.cards.shift());
        }
        this.updateGallery();
    }

    setControls() {
        this.controls.forEach(control => {
            let btn = document.createElement('Button');
            btn.className = `gallery-controls-${control}`;
            btn.innerHTML = control;
            this.container.appendChild(btn);
        });
        document.querySelector(`.gallery-controls-${controls}`).innerHTML = controls;
        
    }

    useControls() {
        const triggers = [...this.container.childNodes];
        triggers.forEach(control => {
            control.addEventListener('click', e => {
                e.preventDefault();
                this.setCurrentState(control);
            });
        });
    }
}

const carousel = new Carousel(galleryContainer, cards, controls);
carousel.setControls();
carousel.useControls();