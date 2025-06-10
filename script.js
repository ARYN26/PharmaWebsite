// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Hero slideshow functionality
    const slides = document.querySelectorAll('.hero-slide');
    let currentSlide = 0;
    let slideInterval;
    
    function updateSlide(newIndex) {
        // Remove all classes
        slides.forEach(slide => {
            slide.classList.remove('active', 'prev');
        });
        
        // Add appropriate classes
        slides[currentSlide].classList.add('prev');
        slides[newIndex].classList.add('active');
        
        currentSlide = newIndex;
    }
    
    function nextSlide() {
        const newIndex = (currentSlide + 1) % slides.length;
        updateSlide(newIndex);
    }
    
    function prevSlide() {
        const newIndex = (currentSlide - 1 + slides.length) % slides.length;
        updateSlide(newIndex);
    }
    
    // Global function for arrow navigation
    window.changeSlide = function(direction) {
        // Clear the auto-advance timer
        clearInterval(slideInterval);
        
        if (direction === 1) {
            nextSlide();
        } else {
            prevSlide();
        }
        
        // Restart the auto-advance timer immediately
        slideInterval = setInterval(nextSlide, 5000);
    }
    
    // Start slideshow immediately on page load
    slideInterval = setInterval(nextSlide, 5000);
    
    // Navigation scroll effect
    const header = document.querySelector('header');
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            header.style.backgroundColor = 'rgba(255, 255, 255, 0.98)';
            header.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        } else {
            header.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        }
    });

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Form submission handling
    const contactForm = document.querySelector('.contact-form form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const name = this.querySelector('input[type="text"]').value;
            const email = this.querySelector('input[type="email"]').value;
            const subject = this.querySelector('input[placeholder="Subject"]').value;
            const message = this.querySelector('textarea').value;
            
            // Here you would normally send the data to your server
            // For now, we'll just show an alert
            alert(`Thank you, ${name}! Your message has been received. We will contact you shortly.`);
            
            // Reset the form
            this.reset();
        });
    }

    // Newsletter form submission
    const newsletterForm = document.querySelector('.footer-newsletter form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = this.querySelector('input[type="email"]').value;
            
            // Here you would normally send the data to your server
            // For now, we'll just show an alert
            alert(`Thank you for subscribing to our newsletter with ${email}!`);
            
            // Reset the form
            this.reset();
        });
    }

    // Add animation effect to cards on scroll
    const animateOnScroll = function() {
        const cards = document.querySelectorAll('.card, .service-item');
        
        cards.forEach(card => {
            const cardPosition = card.getBoundingClientRect().top;
            const screenPosition = window.innerHeight / 1.3;
            
            if (cardPosition < screenPosition) {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }
        });
    };

    // Initialize card animations
    const cards = document.querySelectorAll('.card, .service-item');
    cards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(50px)';
        card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    });

    // Listen for scroll to trigger animations
    window.addEventListener('scroll', animateOnScroll);
    
    // Trigger once on load to show initial elements
    animateOnScroll();
}); 