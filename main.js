var typed = new Typed(".text", {
    strings: ["Engineer", "Innovator", "Entrepreneur", "Developer", "Designer"],
    typeSpeed: 100,
    backspeed: 100,
    backDelay: 1000,
    loop:true
})

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

function toggleReadMore() {
    var moreText = document.getElementById("more");
    var btnText = document.querySelector(".btn-box");
  
    if (moreText.style.display === "none") {
      moreText.style.display = "inline";
      btnText.textContent = "Read Less";
    } else {
      moreText.style.display = "none";
      btnText.textContent = "Read More";
    }
  }