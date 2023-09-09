const btn = document.querySelector('button.mobile-menu-button');
const menu = document.querySelector('.mobile-menu');

// Show menu on click
btn.addEventListener('click', () => {
    menu.classList.toggle('hidden');
});