// Cache busting utility
function addCacheBuster(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=2.2&cb=${Date.now()}`;
}

// Update dynamic resources with cache busting if needed
function refreshCriticalResources() {
    // This function can be called to refresh critical resources
    // Currently, static versioning is sufficient, but this provides future flexibility
    const version = '3.2';
    const timestamp = Date.now();
    
    // Store version info for debugging
    window.SITE_VERSION = {
        version: version,
        timestamp: timestamp,
        build: '2025-06-30-v3.2'
    };
}

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize cache busting info
    refreshCriticalResources();
    // Image lazy loading optimization
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');
    
    // IntersectionObserver for better lazy loading control
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    
                    // Add loading class for smooth transition
                    img.classList.add('loading');
                    
                    // Handle image load
                    const handleImageLoad = () => {
                        img.classList.remove('loading');
                        img.classList.add('loaded');
                    };
                    
                    // Handle image error with better fallback
                    const handleImageError = () => {
                        img.classList.remove('loading');
                        img.classList.add('error');
                        
                        // Create a better fallback with the pharmacy logo
                        const fallbackSVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23ecf0f1'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%231a5276' font-family='Arial' font-size='20' font-weight='bold'%3EDUO PRIME CARE%3C/text%3E%3Ctext x='50%25' y='60%25' text-anchor='middle' dy='.3em' fill='%232e86c1' font-family='Arial' font-size='14'%3EImage Loading...%3C/text%3E%3C/svg%3E`;
                        img.src = fallbackSVG;
                        
                        // Try to reload the original image after a delay
                        const originalSrc = img.getAttribute('data-src') || img.src;
                        if (!img.hasAttribute('data-retry-count')) {
                            img.setAttribute('data-retry-count', '0');
                        }
                        const retryCount = parseInt(img.getAttribute('data-retry-count'));
                        if (retryCount < 3 && !originalSrc.includes('data:image')) {
                            setTimeout(() => {
                                img.setAttribute('data-retry-count', (retryCount + 1).toString());
                                img.src = originalSrc;
                            }, 2000 * (retryCount + 1));
                        }
                    };
                    
                    img.addEventListener('load', handleImageLoad, { once: true });
                    img.addEventListener('error', handleImageError, { once: true });
                    
                    // Force load if not already loaded
                    if (!img.complete) {
                        img.src = img.src;
                    } else if (img.naturalWidth > 0) {
                        handleImageLoad();
                    } else {
                        handleImageError();
                    }
                    
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px 0px', // Start loading 50px before entering viewport
            threshold: 0.01
        });
        
        lazyImages.forEach(img => {
            imageObserver.observe(img);
        });
    } else {
        // Fallback for older browsers
        lazyImages.forEach(img => {
            img.classList.add('loaded');
        });
    }
    
    // Hero slideshow images
    const heroImages = [
        'photos/main3.jpg?v=3.2',
        'photos/main2.jpg?v=3.2', 
        'photos/mainfront.png?v=3.2'
    ];
    
    // Preload all hero slideshow images
    const criticalImages = [...heroImages]; // All hero slideshow images
    criticalImages.forEach(src => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = src;
        document.head.appendChild(link);
    });
    
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
            e.stopPropagation();
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                // Close mobile menu if open
                const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
                const navLinks = document.querySelector('.nav-links');
                if (mobileMenuToggle && navLinks && navLinks.classList.contains('active')) {
                    mobileMenuToggle.classList.remove('active');
                    navLinks.classList.remove('active');
                    mobileMenuToggle.setAttribute('aria-expanded', 'false');
                    document.body.style.overflow = '';
                    document.body.style.position = '';
                    document.body.style.width = '';
                }
                
                // Calculate scroll position with header offset
                const headerHeight = document.querySelector('header').offsetHeight || 80;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                
                // Update URL without triggering scroll
                if (history.pushState) {
                    history.pushState(null, null, targetId);
                }
            }
        });
    });

    // Form submission handling with Web3Forms (automatic - no JS needed)
    // Web3Forms handles everything automatically, but we can add loading state
    const contactForm = document.querySelector('form[action*="web3forms"]');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            // Validate form
            const requiredFields = this.querySelectorAll('[required]');
            let isValid = true;
            
            requiredFields.forEach(field => {
                if (!field.value.trim()) {
                    isValid = false;
                    field.classList.add('error');
                } else {
                    field.classList.remove('error');
                }
            });
            
            if (!isValid) {
                e.preventDefault();
                return;
            }
            
            // Show loading state
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;
            submitBtn.classList.add('loading');
            
            // Let the form submit naturally to Web3Forms
            // After 2 seconds, restore button (in case user stays on page)
            setTimeout(() => {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                submitBtn.classList.remove('loading');
            }, 2000);
        });
        
        // Remove error class on input
        contactForm.querySelectorAll('input, textarea').forEach(field => {
            field.addEventListener('input', function() {
                this.classList.remove('error');
            });
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
        const cards = document.querySelectorAll('.card, .service-item, .health-tip-card');
        
        cards.forEach(card => {
            const cardPosition = card.getBoundingClientRect().top;
            const screenPosition = window.innerHeight / 1.3;
            
            if (cardPosition < screenPosition && !card.classList.contains('animated')) {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
                card.classList.add('animated');
            }
        });
    };

    // Initialize card animations with IntersectionObserver for better performance
    const cards = document.querySelectorAll('.card, .service-item, .health-tip-card');
    
    if ('IntersectionObserver' in window) {
        const cardObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.classList.contains('animated')) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    entry.target.classList.add('animated');
                }
            });
        }, {
            rootMargin: '0px 0px -50px 0px',
            threshold: 0.1
        });
        
        cards.forEach(card => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(30px)';
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            cardObserver.observe(card);
        });
    } else {
        // Fallback for older browsers
        cards.forEach(card => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(50px)';
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        });
        
        // Listen for scroll to trigger animations
        window.addEventListener('scroll', animateOnScroll);
        
        // Trigger once on load to show initial elements
        animateOnScroll();
    }

    // Hero Sliding Slideshow Functionality
    const heroSlider = document.querySelector('.hero-slider');
    const heroSlides = document.querySelectorAll('.hero-slide');
    const heroDots = document.querySelectorAll('.hero-dot');
    const heroPrevBtn = document.querySelector('.hero-nav-btn.prev');
    const heroNextBtn = document.querySelector('.hero-nav-btn.next');
    const heroSection = document.querySelector('.hero');
    
    let currentHeroIndex = 0;
    let heroInterval;

    function updateHeroSlider() {
        if (heroSlider) {
            const translateX = -currentHeroIndex * 33.333;
            heroSlider.style.transform = `translateX(${translateX}%)`;
            
            // Update dots
            heroDots.forEach((dot, index) => {
                dot.classList.toggle('active', index === currentHeroIndex);
            });
        }
    }

    function nextHeroSlide() {
        currentHeroIndex = (currentHeroIndex + 1) % heroSlides.length;
        updateHeroSlider();
    }

    function prevHeroSlide() {
        currentHeroIndex = (currentHeroIndex - 1 + heroSlides.length) % heroSlides.length;
        updateHeroSlider();
    }

    function goToHeroSlide(index) {
        currentHeroIndex = index;
        updateHeroSlider();
    }

    function startHeroSlideshow() {
        heroInterval = setInterval(nextHeroSlide, 5000); // 5 seconds
    }

    function stopHeroSlideshow() {
        clearInterval(heroInterval);
    }

    function restartHeroSlideshow() {
        stopHeroSlideshow();
        startHeroSlideshow();
    }

    // Initialize hero slideshow
    if (heroSlider && heroSlides.length > 0) {
        // Set initial images for each slide with error handling
        heroSlides.forEach((slide, index) => {
            const bgImage = slide.getAttribute('data-bg');
            if (bgImage) {
                // Use the path as-is (relative paths work for both file:// and http://)
                const imagePath = bgImage;
                
                // Create a picture element for WebP support
                const webpPath = imagePath.replace(/\.(jpg|png)/, '.webp').replace('?v=3.2', '?v=3.2');
                
                // Try WebP first
                const webpImg = new Image();
                webpImg.onload = () => {
                    slide.style.backgroundImage = `url('${webpPath}')`;
                    slide.classList.add('loaded');
                };
                webpImg.onerror = () => {
                    // Fallback to original format
                    const img = new Image();
                    img.onload = () => {
                        slide.style.backgroundImage = `url('${imagePath}')`;
                        slide.classList.add('loaded');
                    };
                    img.onerror = () => {
                        console.error(`Failed to load hero image: ${imagePath}`);
                        // Set fallback gradient with brand colors
                        slide.style.background = 'linear-gradient(135deg, #1a5276, #3498db)';
                        slide.style.color = 'white';
                        slide.classList.add('fallback');
                    };
                    img.src = imagePath;
                };
                // Check if browser supports WebP
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 1;
                if (canvas.toDataURL('image/webp').indexOf('image/webp') === 5) {
                    webpImg.src = webpPath;
                } else {
                    // Skip WebP and load original
                    webpImg.onerror();
                }
            }
        });
        
        // Initialize slider position
        updateHeroSlider();
        
        // Start slideshow after a short delay
        setTimeout(() => {
            startHeroSlideshow();
        }, 2000);

        // Add event listeners for manual controls
        if (heroNextBtn) {
            heroNextBtn.addEventListener('click', () => {
                nextHeroSlide();
                restartHeroSlideshow();
            });
        }

        if (heroPrevBtn) {
            heroPrevBtn.addEventListener('click', () => {
                prevHeroSlide();
                restartHeroSlideshow();
            });
        }

        // Add event listeners for dots
        heroDots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                goToHeroSlide(index);
                restartHeroSlideshow();
            });
        });

        // Pause slideshow on hover
        if (heroSection) {
            heroSection.addEventListener('mouseenter', stopHeroSlideshow);
            heroSection.addEventListener('mouseleave', startHeroSlideshow);
        }

        // Touch/Swipe support for mobile
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;
        let isSwiping = false;

        function handleSwipe() {
            const swipeThreshold = 50;
            const verticalThreshold = 100;
            
            const deltaX = touchEndX - touchStartX;
            const deltaY = Math.abs(touchEndY - touchStartY);
            
            // Only process horizontal swipes (ignore vertical scrolling)
            if (deltaY < verticalThreshold && Math.abs(deltaX) > swipeThreshold) {
                if (deltaX > 0) {
                    // Swipe right - go to previous slide
                    prevHeroSlide();
                    restartHeroSlideshow();
                } else {
                    // Swipe left - go to next slide
                    nextHeroSlide();
                    restartHeroSlideshow();
                }
            }
            isSwiping = false;
        }

        if (heroSection) {
            heroSection.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
                touchStartY = e.changedTouches[0].screenY;
                isSwiping = true;
            }, { passive: true });

            heroSection.addEventListener('touchmove', (e) => {
                if (!isSwiping) return;
                
                // Prevent default if horizontal swipe
                const currentX = e.changedTouches[0].screenX;
                const currentY = e.changedTouches[0].screenY;
                const deltaX = Math.abs(currentX - touchStartX);
                const deltaY = Math.abs(currentY - touchStartY);
                
                if (deltaX > deltaY && deltaX > 10) {
                    e.preventDefault();
                }
            }, { passive: false });

            heroSection.addEventListener('touchend', (e) => {
                if (!isSwiping) return;
                touchEndX = e.changedTouches[0].screenX;
                touchEndY = e.changedTouches[0].screenY;
                handleSwipe();
            }, { passive: true });
        }
    }

    // Testimonial Carousel Functionality (Single View with Smooth Sliding)
    const testimonials = document.querySelectorAll('.testimonial');
    const testimonialTrack = document.querySelector('.testimonial-track');
    const testimonialPrevBtn = document.querySelector('.testimonial-nav-btn.prev');
    const testimonialNextBtn = document.querySelector('.testimonial-nav-btn.next');
    let currentIndex = 0;
    let testimonialInterval;
    let autoResumeTimeout;
    let isUserInteracting = false;

    // Touch/swipe variables
    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;

    function updateTestimonialDisplay() {
        if (testimonials.length === 0 || !testimonialTrack) return;
        
        // Calculate the transform position for smooth sliding
        const translateX = -currentIndex * 100;
        testimonialTrack.style.transform = `translateX(${translateX}%)`;
        
        // Add smooth transition if not already set
        if (!testimonialTrack.style.transition) {
            testimonialTrack.style.transition = 'transform 0.5s ease-in-out';
        }
    }

    function goToTestimonial(index) {
        if (testimonials.length === 0) return;
        
        currentIndex = (index + testimonials.length) % testimonials.length;
        updateTestimonialDisplay();
    }

    function nextTestimonial() {
        goToTestimonial(currentIndex + 1);
    }

    function prevTestimonial() {
        goToTestimonial(currentIndex - 1);
    }

    function startAutoRotation() {
        stopAutoRotation();
        testimonialInterval = setInterval(() => {
            if (!isUserInteracting) {
                nextTestimonial();
            }
        }, 3000);
    }

    function stopAutoRotation() {
        clearInterval(testimonialInterval);
        clearTimeout(autoResumeTimeout);
    }

    function pauseAndResume() {
        isUserInteracting = true;
        stopAutoRotation();
        
        // Resume auto-rotation after 2 seconds of no interaction
        clearTimeout(autoResumeTimeout);
        autoResumeTimeout = setTimeout(() => {
            isUserInteracting = false;
            startAutoRotation();
        }, 2000);
    }

    // Handle touch events for swipe detection
    let isTouchMoving = false;
    let touchStartTime = 0;
    
    function handleTouchStart(e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        isTouchMoving = false;
    }
    
    function handleTouchMove(e) {
        if (!isTouchMoving) {
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const deltaX = Math.abs(currentX - touchStartX);
            const deltaY = Math.abs(currentY - touchStartY);
            
            // Determine if this is a horizontal swipe
            if (deltaX > 10 || deltaY > 10) {
                isTouchMoving = true;
                // Prevent vertical scroll if horizontal swipe
                if (deltaX > deltaY) {
                    e.preventDefault();
                }
            }
        } else if (isTouchMoving) {
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const deltaX = Math.abs(currentX - touchStartX);
            const deltaY = Math.abs(currentY - touchStartY);
            
            // Continue preventing scroll for horizontal swipes
            if (deltaX > deltaY) {
                e.preventDefault();
            }
        }
    }

    function handleTouchEnd(e) {
        if (!isTouchMoving) return;
        
        touchEndX = e.changedTouches[0].clientX;
        touchEndY = e.changedTouches[0].clientY;
        const touchDuration = Date.now() - touchStartTime;
        
        // Only process quick swipes (less than 500ms)
        if (touchDuration < 500) {
            handleSwipe();
        }
        
        isTouchMoving = false;
    }

    function handleSwipe() {
        const deltaX = touchStartX - touchEndX;
        const deltaY = Math.abs(touchStartY - touchEndY);
        const minSwipeDistance = 30; // Reduced for better mobile sensitivity
        
        // Only process horizontal swipes (ignore vertical scrolling)
        if (Math.abs(deltaX) > minSwipeDistance && deltaY < 100) {
            pauseAndResume();
            
            if (deltaX > 0) {
                // Swipe left - go to next testimonial
                nextTestimonial();
            } else {
                // Swipe right - go to previous testimonial
                prevTestimonial();
            }
        }
    }

    // Initialize testimonial carousel
    if (testimonials.length > 0) {
        // Set up the track for horizontal sliding
        if (testimonialTrack) {
            testimonialTrack.style.display = 'flex';
            testimonialTrack.style.transition = 'transform 0.5s ease-in-out';
            
            // Set each testimonial to take full width
            testimonials.forEach((testimonial) => {
                testimonial.style.flex = '0 0 100%';
                testimonial.style.minWidth = '100%';
            });
        }
        
        // Set up initial display
        updateTestimonialDisplay();
        
        // Add click event listeners to navigation buttons
        if (testimonialPrevBtn) {
            testimonialPrevBtn.addEventListener('click', () => {
                pauseAndResume();
                prevTestimonial();
            });
        }
        
        if (testimonialNextBtn) {
            testimonialNextBtn.addEventListener('click', () => {
                pauseAndResume();
                nextTestimonial();
            });
        }

        // Add touch event listeners to testimonial wrapper
        const testimonialWrapper = document.querySelector('.testimonial-wrapper');
        if (testimonialWrapper) {
            testimonialWrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
            testimonialWrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
            testimonialWrapper.addEventListener('touchend', handleTouchEnd, { passive: true });
            
            // Prevent default touch behavior on buttons
            [testimonialPrevBtn, testimonialNextBtn].forEach(btn => {
                if (btn) {
                    btn.addEventListener('touchstart', (e) => {
                        e.stopPropagation();
                    }, { passive: true });
                }
            });
        }

        // Start auto-rotation
        startAutoRotation();
        
        // Handle window resize
        window.addEventListener('resize', updateTestimonialDisplay);
    }

    // Mobile menu toggle functionality with enhanced touch support
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    const body = document.body;
    
    if (mobileMenuToggle && navLinks) {
        // Add touch event handling for better mobile response
        let touchStartTime = 0;
        
        mobileMenuToggle.addEventListener('touchstart', function(e) {
            touchStartTime = Date.now();
            e.preventDefault(); // Prevent double-tap zoom
        }, { passive: false });
        
        mobileMenuToggle.addEventListener('touchend', function(e) {
            e.preventDefault();
            const touchDuration = Date.now() - touchStartTime;
            
            // Only trigger if it's a tap (not a long press)
            if (touchDuration < 300) {
                toggleMobileMenu();
            }
        }, { passive: false });
        
        // Fallback for click events
        mobileMenuToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleMobileMenu();
        });
        
        function toggleMobileMenu() {
            const isExpanded = mobileMenuToggle.getAttribute('aria-expanded') === 'true';
            mobileMenuToggle.classList.toggle('active');
            navLinks.classList.toggle('active');
            mobileMenuToggle.setAttribute('aria-expanded', !isExpanded);
            
            // Prevent body scroll when menu is open
            if (!isExpanded) {
                body.style.overflow = 'hidden';
                // Store current scroll position
                body.dataset.scrollY = window.scrollY;
            } else {
                body.style.overflow = '';
                // Restore scroll position
                const scrollY = body.dataset.scrollY;
                if (scrollY) {
                    window.scrollTo(0, parseInt(scrollY));
                }
            }
        }
        
        // Close mobile menu when a link is clicked with touch support
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', function() {
                closeMobileMenu();
            });
            
            // Enhanced touch support for links
            link.addEventListener('touchend', function(e) {
                e.stopPropagation();
                closeMobileMenu();
            }, { passive: true });
        });
        
        function closeMobileMenu() {
            mobileMenuToggle.classList.remove('active');
            navLinks.classList.remove('active');
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
            body.style.overflow = '';
            // Restore scroll position
            const scrollY = body.dataset.scrollY;
            if (scrollY) {
                window.scrollTo(0, parseInt(scrollY));
            }
        }
        
        // Close mobile menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!mobileMenuToggle.contains(e.target) && !navLinks.contains(e.target)) {
                mobileMenuToggle.classList.remove('active');
                navLinks.classList.remove('active');
                mobileMenuToggle.setAttribute('aria-expanded', 'false');
                body.style.overflow = '';
            }
        });
        
        // Handle escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && navLinks.classList.contains('active')) {
                mobileMenuToggle.classList.remove('active');
                navLinks.classList.remove('active');
                mobileMenuToggle.setAttribute('aria-expanded', 'false');
                body.style.overflow = '';
            }
        });
    }

    // FAQ Toggle Functionality
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        
        question.addEventListener('click', () => {
            // Close other open FAQ items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });
            
            // Toggle current item
            item.classList.toggle('active');
        });
    });

    // Chat widget toggle functionality with enhanced mobile support
    const chatWidget = document.querySelector('.chat-widget');
    const chatToggle = document.querySelector('.chat-toggle');
    const chatOptions = document.querySelector('.chat-options');
    
    if (chatWidget && chatToggle && chatOptions) {
        let isOpen = false;
        let touchStartTime = 0;
        
        // Enhanced touch handling for chat toggle
        chatToggle.addEventListener('touchstart', function(e) {
            touchStartTime = Date.now();
            e.preventDefault();
        }, { passive: false });
        
        chatToggle.addEventListener('touchend', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const touchDuration = Date.now() - touchStartTime;
            
            if (touchDuration < 300) {
                toggleChat();
            }
        }, { passive: false });
        
        // Fallback click handler
        chatToggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleChat();
        });
        
        function toggleChat() {
            isOpen = !isOpen;
            
            if (isOpen) {
                chatOptions.classList.add('chat-open');
                chatToggle.classList.add('active');
                chatToggle.setAttribute('aria-expanded', 'true');
            } else {
                chatOptions.classList.remove('chat-open');
                chatToggle.classList.remove('active');
                chatToggle.setAttribute('aria-expanded', 'false');
            }
        }
        
        // Close chat when clicking outside
        document.addEventListener('click', function(e) {
            if (!chatWidget.contains(e.target)) {
                isOpen = false;
                chatOptions.classList.remove('chat-open');
                chatToggle.classList.remove('active');
            }
        });
        
        // Handle chat option clicks
        const chatOptionLinks = document.querySelectorAll('.chat-option');
        chatOptionLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                // Allow the link to work normally, but close the chat
                setTimeout(() => {
                    isOpen = false;
                    chatOptions.classList.remove('chat-open');
                    chatToggle.classList.remove('active');
                    // Update mobile menu toggle aria-expanded
                    const mobileToggle = document.querySelector('.mobile-menu-toggle');
                    if (mobileToggle) {
                        mobileToggle.setAttribute('aria-expanded', 'false');
                    }
                }, 100);
            });
        });
    }
}); 