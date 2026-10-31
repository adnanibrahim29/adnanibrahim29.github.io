var heroWords = ["Engineer", "Innovator", "Entrepreneur", "Developer", "Designer"];

// With reduced motion, show the first word instead of the looping typing animation
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelector('.text').textContent = heroWords[0];
} else {
    var typed = new Typed(".text", {
        strings: heroWords,
        typeSpeed: 100,
        backspeed: 100,
        backDelay: 1000,
        loop:true
    })
}

let sections = document.querySelectorAll('section');
let navLinks = document.querySelectorAll('header nav a');

window.onscroll = () => {
    sections.forEach(sec => {
        let top = window.scrollY;
        let offset = sec.offsetTop - 300;
        let height = sec.offsetHeight;
        let id = sec.getAttribute('id');

        if(top >= offset && top < offset + height) {
            navLinks.forEach(links => {
                links.classList.remove('active');
                document.querySelector('header nav a[href*=' + id + ']').classList.add('active');
            });
        };
    });
};

document.getElementById('year').textContent = new Date().getFullYear();
