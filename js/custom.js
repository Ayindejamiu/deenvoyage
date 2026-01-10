AOS.init({
	duration: 800,
	easing: 'slide',
	once: true
});

$(function(){

	'use strict';

	$(".loader").delay(200).fadeOut("slow");
	$("#overlayer").delay(200).fadeOut("slow");	

	var siteMenuClone = function() {

		$('.js-clone-nav').each(function() {
			var $this = $(this);
			$this.clone().attr('class', 'site-nav-wrap').appendTo('.site-mobile-menu-body');
		});


		setTimeout(function() {
			
			var counter = 0;
			$('.site-mobile-menu .has-children').each(function(){
				var $this = $(this);
				
				$this.prepend('<span class="arrow-collapse collapsed">');

				$this.find('.arrow-collapse').attr({
					'data-toggle' : 'collapse',
					'data-target' : '#collapseItem' + counter,
				});

				$this.find('> ul').attr({
					'class' : 'collapse',
					'id' : 'collapseItem' + counter,
				});

				counter++;

			});

		}, 1000);

		$('body').on('click', '.arrow-collapse', function(e) {
			var $this = $(this);
			if ( $this.closest('li').find('.collapse').hasClass('show') ) {
				$this.removeClass('active');
			} else {
				$this.addClass('active');
			}
			e.preventDefault();  
			
		});

		$(window).resize(function() {
			var $this = $(this),
			w = $this.width();

			if ( w > 768 ) {
				if ( $('body').hasClass('offcanvas-menu') ) {
					$('body').removeClass('offcanvas-menu');
				}
			}
		})

		$('body').on('click', '.js-menu-toggle', function(e) {
			var $this = $(this);
			e.preventDefault();

			if ( $('body').hasClass('offcanvas-menu') ) {
				$('body').removeClass('offcanvas-menu');
				$('body').find('.js-menu-toggle').removeClass('active');
			} else {
				$('body').addClass('offcanvas-menu');
				$('body').find('.js-menu-toggle').addClass('active');
			}
		}) 

		// click outisde offcanvas
		$(document).mouseup(function(e) {
			var container = $(".site-mobile-menu");
			if (!container.is(e.target) && container.has(e.target).length === 0) {
				if ( $('body').hasClass('offcanvas-menu') ) {
					$('body').removeClass('offcanvas-menu');
					$('body').find('.js-menu-toggle').removeClass('active');
				}
			}
		});
	}; 
	siteMenuClone();

	var owlPlugin = function() {
		if ( $('.owl-3-slider').length > 0 ) {
			var owl3 = $('.owl-3-slider').owlCarousel({
				loop: true,
				autoHeight: true,
				margin: 10,
				autoplay: true,
				smartSpeed: 700,
				items: 1,
				nav: true,
				dots: true,
				navText: ['<span class="icon-keyboard_backspace"></span>','<span class="icon-keyboard_backspace"></span>'],
				responsive:{
					0:{
						items:1
					},
					600:{
						items:1
					},
					800: {
						items:2
					},
					1000:{
						items:2
					},
					1100:{
						items:3
					}
				}
			});
		}
		if ( $('.owl-4-slider').length > 0 ) {
			var owl4 = $('.owl-4-slider').owlCarousel({
				loop: true,
				autoHeight: true,
				margin: 10,
				autoplay: true,
				smartSpeed: 700,
				items: 4,
				nav: true,
				dots: true,
				navText: ['<span class="icon-keyboard_backspace"></span>','<span class="icon-keyboard_backspace"></span>'],
				responsive:{
					0:{
						items:1
					},
					600:{
						items:2
					},
					800: {
						items:2
					},
					1000:{
						items:3
					},
					1100:{
						items:4
					}
				}
			});

			$('.js-custom-next-v2').click(function(e) {
				e.preventDefault();
				owl4.trigger('next.owl.carousel');
			})
			$('.js-custom-prev-v2').click(function(e) {
				e.preventDefault();
				owl4.trigger('prev.owl.carousel');
			})
		}

		if ( $('.owl-single-text').length > 0 ) {
			var owlText = $('.owl-single-text').owlCarousel({
				loop: true,
				autoHeight: true,
				margin: 0,
				autoplay: true,
				smartSpeed: 1200,
				items: 1,
				nav: false,
				navText: ['<span class="icon-keyboard_backspace"></span>','<span class="icon-keyboard_backspace"></span>']
			});
		}
		if ( $('.owl-single').length > 0 ) {
			var owl = $('.owl-single').owlCarousel({
				loop: true,
				autoHeight: true,
				margin: 0,
				autoplay: true,
				smartSpeed: 800,
				items: 1,
				nav: false,
				navText: ['<span class="icon-keyboard_backspace"></span>','<span class="icon-keyboard_backspace"></span>'],
				onInitialized: counter
			});

			function counter(event) {
				$('.owl-total').text(event.item.count);
			}
			
			$('.js-custom-owl-next').click(function(e) {
				e.preventDefault();
				owl.trigger('next.owl.carousel');
				owlText.trigger('next.owl.carousel');
			})
			$('.js-custom-owl-prev').click(function(e) {
				e.preventDefault();
				owl.trigger('prev.owl.carousel');
				owlText.trigger('prev.owl.carousel');
			})

			$('.owl-dots .owl-dot').each(function(i) {
				$(this).attr('data-index', i - 3);
			});

			owl.on('changed.owl.carousel', function(event) {
				var i = event.item.index;
				if ( i === 1 ) {
					i = event.item.count;
				} else {
					i = i - 1;
				}
				$('.owl-current').text(i);
				$('.owl-total').text(event.item.count);
			})
		}

	}
	owlPlugin();

	var counter = function() {
		
		$('.count-numbers').waypoint( function( direction ) {

			if( direction === 'down' && !$(this.element).hasClass('ut-animated') ) {

				var comma_separator_number_step = $.animateNumber.numberStepFactories.separator(',')
				$('.counter > span').each(function(){
					var $this = $(this),
					num = $this.data('number');
					$this.animateNumber(
					{
						number: num,
						numberStep: comma_separator_number_step
					}, 7000
					);
				});
				
			}

		} , { offset: '95%' } );

	}
	counter();
	
	if($('input[name="daterange"]').length) {
		$('input[name="daterange"]').daterangepicker();
	}

	// Quote form handler: redirect to /register with provided params
	$('#quote-form').on('submit', function(e) {
		e.preventDefault();
		try {
			var name = $('#quote-name').val() || '';
			var email = $('#quote-email').val() || '';
			var phone = $('#quote-phone').val() || '';
			var dest = $('#quote-dest').val() || '';
			var message = $('#quote-message').val() || '';

			var params = [];
			if (dest) params.push('dest=' + encodeURIComponent(dest));
			if (name) params.push('name=' + encodeURIComponent(name));
			if (email) params.push('email=' + encodeURIComponent(email));
			if (phone) params.push('phone=' + encodeURIComponent(phone));
			if (message) params.push('message=' + encodeURIComponent(message));

			var url = '/register' + (params.length ? ('?' + params.join('&')) : '');
			// Close modal if bootstrap is available
			if (typeof $().modal === 'function') {
				$('#quoteModal').modal('hide');
			}
			window.location.href = url;
		} catch (err) {
			console.warn('Quote form error', err);
			// fallback: normal submit
			this.submit();
		}
	});

	// Dynamic active nav highlighting (works with clean URLs, removes need for hardcoded "active" classes)
	var setActiveNav = function() {
		try {
			var path = window.location.pathname || '/';
			// Normalize: remove leading slash and trailing slash
			path = path.replace(/^\/+/, '').replace(/\/+$/, '');
			// If URL points to a file with extension, strip it (e.g., index.html -> index)
			var current = path === '' ? 'index' : path.replace(/\.html$/i, '');

			// Function to normalize href values from anchor tags
			var normalizeHref = function(href) {
				if (!href) return 'index';
				// Remove origin if present
				href = href.replace(location.origin, '');
				href = href.replace(/^\/+/, '').replace(/\/+$/, '');
				href = href.replace(/\.html$/i, '');
				return href === '' ? 'index' : href;
			};

			// Select all nav links (desktop and cloned mobile nav)
			var navSelectors = document.querySelectorAll('.site-menu a, .js-clone-nav a, .site-nav a');
			navSelectors.forEach(function(a) {
				var href = a.getAttribute('href');
				var norm = normalizeHref(href);
				var li = a.closest('li');
				if (!li) return;
				if (norm === current) {
					li.classList.add('active');
				} else {
					li.classList.remove('active');
				}
			});
		} catch (e) {
			// fail silently - non-critical
			console.warn('setActiveNav failed', e);
		}
	};

	// Run once on load
	setActiveNav();

	// Also run when history changes (optional, handles SPA-like navigations)
	window.addEventListener('popstate', setActiveNav);

	// Prefill register form from query params (if on register page)
	var prefillRegister = function() {
		try {
			if (!document.getElementById('registration-form')) return;
			var params = new URLSearchParams(window.location.search);
			var name = params.get('name') || params.get('fullname') || '';
			var email = params.get('email') || '';
			var phone = params.get('phone') || params.get('tel') || '';
			var dest = params.get('dest') || params.get('travel') || params.get('travelType') || '';
			var message = params.get('message') || params.get('msg') || params.get('requirements') || '';

			// Name: split into first and last
			if (name) {
				var parts = name.trim().split(/\s+/);
				if (parts.length === 1) {
					$('#fname').val(parts[0]);
				} else {
					$('#fname').val(parts.shift());
					$('#lname').val(parts.join(' '));
				}
			}
			if (email) $('#email').val(email);
			if (phone) $('#phone').val(phone);
			if (message) $('#requirements').val(decodeURIComponent(message));

			// Map dest to a travelType option
			if (dest) {
				dest = dest.toLowerCase();
				var $sel = $('#travelType');
				if ($sel.length) {
					// Try to find option containing key words
					var found = false;
					$sel.find('option').each(function(){
						var txt = $(this).text().toLowerCase();
						if (txt.indexOf(dest) !== -1) {
							$(this).prop('selected', true);
							found = true;
							return false;
						}
					});
					if (!found) {
						// try simple mappings
						if (dest.indexOf('hajj') !== -1) $sel.val($sel.find('option:contains("Hajj")').val());
						if (dest.indexOf('umrah') !== -1) $sel.val($sel.find('option:contains("Umrah")').val());
					}
				}
			}

			// Passport 'Other' toggle handling if present
			if ($('#passportType').length) {
				var p = params.get('passport') || '';
				if (p) {
					$('#passportType').val(p);
					if (typeof toggleOtherPassport === 'function') toggleOtherPassport();
				}
			}
		} catch (e) {
			console.warn('prefillRegister failed', e);
		}
	};

	// Run prefill on load
	prefillRegister();
})