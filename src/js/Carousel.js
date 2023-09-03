const galleryContainer = document.querySelector('.Project');
const controller = document.querySelector('.controller');
const controls = ['left-arrow', 'right-arrow']
const cards = document.querySelectorAll('.cards');

let mainCard = document.querySelector('.card-3');
let numberOfCards = cards.length;

class Carousel {
    constructor(container, cards, controls) {
        this.container = container;
        this.cards = [...cards];
        this.controls = controls;
    }

    updateGallery() {
        this.cards.forEach(card => {
            for (let i = 1; i <= numberOfCards; i++) {
                card.classList.remove(`card-${i}`);
            }

            const button = card.querySelector('.button');
            if (button) {
                button.removeEventListener('click', this.onButtonClick);
            }
        });

        // Add new 'card-x' class names to the first 5 cards
        this.cards.slice(0, numberOfCards).forEach((card, index) => {
            card.classList.add(`card-${index + 1}`);
        });
        
        mainCard = document.querySelector('.card-3');
        this.buttonClickEvent();

    }

    updateBar() {
        
    }


    setCurrentState(direction) {
        if (direction.className.includes('controller-previous')){
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
        const triggers = [...this.container.querySelector('.arrow-container').childNodes];
        triggers.forEach(control => {
            control.addEventListener('click', e => {
                console.log(control);
                e.preventDefault();
                this.setCurrentState(control);
            });
        });
    }

    buttonClickEvent() {
        mainCard.querySelector('.button').addEventListener('click', this.onButtonClick);
    }

    onButtonClick() {
        console.log('clicked');
    }

}

const carousel = new Carousel(galleryContainer, cards, controls);
//carousel.setControls();
carousel.useControls();
carousel.buttonClickEvent();