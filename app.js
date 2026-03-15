// --- CONFIGURATION ---
const TMDB_TOKEN = '';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const API_OPTIONS = {
    method: 'GET',
    headers: {
        accept: 'application/json',
        Authorization: `Bearer ${TMDB_TOKEN}`
    }
};

// --- DATA STATE ---
let MOVIE_DATA = [];
let userRatings = JSON.parse(localStorage.getItem('moviehub_ratings')) || {};
let currentFilter = 'All';

// --- API FETCHING LOGIC ---

async function initializeData() {
    try {
        const endpoints = {
            "Top 10 Today": "trending/movie/day",
            "Hollywood": "discover/movie?with_original_language=en&sort_by=popularity.desc",
            "Bollywood": "discover/movie?with_original_language=hi&region=IN&sort_by=popularity.desc",
            "South Indian": "discover/movie?with_original_language=te|ta|kn|ml&region=IN&sort_by=popularity.desc",
            "Odia Hits": "discover/movie?with_original_language=or&sort_by=primary_release_date.desc",
            "Bangla": "discover/movie?with_original_language=bn&sort_by=popularity.desc",
            "Horror": "discover/movie?with_genres=27&sort_by=popularity.desc",
            "Drama": "discover/movie?with_genres=18&sort_by=popularity.desc",
        };

        const requests = Object.entries(endpoints).map(([name, url]) => 
            // Fetching Page 1 and Page 2 to ensure we have 30+ movies for each category
            Promise.all([
                fetch(`https://api.themoviedb.org/3/${url}&page=1`, API_OPTIONS).then(res => res.json()),
                fetch(`https://api.themoviedb.org/3/${url}&page=2`, API_OPTIONS).then(res => res.json())
            ]).then(pages => {
                const combinedResults = [...(pages[0].results || []), ...(pages[1].results || [])];
                const mappedMovies = combinedResults.slice(0, 30).map(m => ({
                    id: m.id,
                    title: m.title || m.name,
                    industry: name,
                    year: m.release_date ? m.release_date.split('-')[0] : (m.first_air_date ? m.first_air_date.split('-')[0] : 'N/A'),
                    rating: m.vote_average ? m.vote_average.toFixed(1) : "0.0",
                    image: m.poster_path ? `${IMAGE_BASE_URL}${m.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image',
                    description: m.overview || "No description available for this title.",
                    trending: m.popularity > 1000
                }));
                return { category: name, movies: mappedMovies };
            })
        );

        const allResults = await Promise.all(requests);
        MOVIE_DATA = allResults.flatMap(res => res.movies);

        renderApp(allResults);
    } catch (err) {
        console.error("Failed to fetch movies from TMDB:", err);
    }
}

// --- CORE RENDERING ---

function renderApp(categories) {
    const container = document.getElementById('movieSections');
    if (!container) return;
    container.innerHTML = '';

    const iconMap = {
        "Top 10 Today": "flame", "Hollywood": "globe", "Bollywood": "zap",
        "South Indian": "navigation", "Bangla": "feather", "Horror": "ghost",
        "Drama": "clapperboard", "Odia Hits": "heart"
    };

    categories.forEach(res => {
        if (res.movies.length > 0) {
            renderRow({
                title: res.category,
                icon: iconMap[res.category] || "play",
                data: res.movies 
            });
        }
    });
    lucide.createIcons();
}

function renderRow(group) {
    const container = document.getElementById('movieSections');
    const rowId = `row-${group.title.replace(/\s+/g, '-').toLowerCase()}`;
    
    const section = document.createElement('section');
    section.className = 'space-y-4 px-6 mb-12';
    section.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                    <i data-lucide="${group.icon}" class="w-5 h-5"></i>
                </div>
                <h2 class="text-xl font-black tracking-tight text-white uppercase">${group.title}</h2>
            </div>
            <div class="flex gap-2">
                <button onclick="scrollRow('${rowId}', -600)" class="p-2 rounded-full glass hover:bg-white/10 text-white transition-all">
                    <i data-lucide="chevron-left" class="w-5 h-5"></i>
                </button>
                <button onclick="scrollRow('${rowId}', 600)" class="p-2 rounded-full glass hover:bg-white/10 text-white transition-all">
                    <i data-lucide="chevron-right" class="w-5 h-5"></i>
                </button>
            </div>
        </div>
        <div class="movie-slider no-scrollbar flex gap-4 overflow-x-auto scroll-smooth pb-4" id="${rowId}">
            ${group.data.map(movie => `
                <div class="movie-card glass rounded-2xl overflow-hidden cursor-pointer shrink-0 w-48 hover:scale-105 transition-all duration-300 group" onclick="openModal(${movie.id})">
                    <div class="relative h-64 overflow-hidden">
                        <img src="${movie.image}" alt="${movie.title}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                        <div class="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-transparent to-transparent opacity-60"></div>
                        <div class="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] font-bold text-yellow-400 flex items-center gap-1">
                            <i data-lucide="star" class="w-2.5 h-2.5 fill-yellow-400"></i> ${movie.rating}
                        </div>
                    </div>
                    <div class="p-4 space-y-1">
                        <h3 class="font-bold text-sm text-white truncate">${movie.title}</h3>
                        <p class="text-[10px] text-indigo-300 font-medium">${movie.year}</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    container.appendChild(section);
}

// --- EMBEDDED TRAILER LOGIC ---

async function playTrailer(movieId) {
    const videoContainer = document.getElementById('videoContainer');
    const player = document.getElementById('trailerPlayer');
    const externalLink = document.getElementById('externalYouTube');
    const movieTitle = document.getElementById('modalTitle').innerText;

    try {
        const response = await fetch(`https://api.themoviedb.org/3/movie/${movieId}/videos`, API_OPTIONS);
        const data = await response.json();
        
        // Priority: Trailer -> Teaser -> Clip -> Any YouTube Video
        let video = data.results.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                    data.results.find(v => (v.type === 'Teaser' || v.type === 'Clip') && v.site === 'YouTube') ||
                    data.results.find(v => v.site === 'YouTube');

        if (video) {
            player.src = `https://www.youtube.com/embed/${video.key}?autoplay=1&modestbranding=1&rel=0`;
            if (externalLink) externalLink.href = `https://www.youtube.com/watch?v=${video.key}`;
        } else {
            // Search Fallback inside popup
            const searchQuery = encodeURIComponent(movieTitle + " official trailer");
            player.src = `https://www.youtube.com/embed?listType=search&list=${searchQuery}&autoplay=1`;
            if (externalLink) externalLink.href = `https://www.youtube.com/results?search_query=${searchQuery}`;
        }
        videoContainer.classList.remove('hidden');
    } catch (err) {
        console.error("Video Error:", err);
    }
    lucide.createIcons();
}

// --- MODAL & STAR RATINGS ---

async function openModal(id) {
    const movie = MOVIE_DATA.find(m => m.id === id);
    if (!movie) return;
    
    const modal = document.getElementById('movieModal');
    
    // UI Reset
    document.getElementById('videoContainer').classList.add('hidden');
    document.getElementById('trailerPlayer').src = "";
    document.getElementById('modalImg').src = movie.image;
    document.getElementById('modalTitle').innerText = movie.title;
    document.getElementById('modalIndustry').innerText = movie.industry;
    document.getElementById('modalRating').innerText = movie.rating;
    document.getElementById('modalSub').innerText = `${movie.industry} (${movie.year})`;
    document.getElementById('modalDesc').innerText = movie.description;
    
    // Trailer Button Logic
    const trailerBtn = modal.querySelector('button.bg-indigo-600');
    if (trailerBtn) {
        trailerBtn.onclick = () => playTrailer(movie.id);
    }

    // Fetch REAL Cast
    try {
        const castRes = await fetch(`https://api.themoviedb.org/3/movie/${id}/credits`, API_OPTIONS);
        const castData = await castRes.json();
        const castContainer = document.getElementById('modalCast');
        castContainer.innerHTML = castData.cast.slice(0, 5).map(c => 
            `<span class="px-4 py-2 glass rounded-xl text-sm font-medium text-gray-300">${c.name}</span>`
        ).join('');
    } catch (err) {
        console.error("Cast Fetch Error:", err);
    }
    
    renderInteractiveStars(movie.id);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => modal.classList.add('active'), 10);
    lucide.createIcons();
}

function renderInteractiveStars(movieId) {
    const container = document.getElementById('modalStarContainer');
    const rating = userRatings[movieId] || 0;
    container.innerHTML = '';
    
    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('i');
        star.setAttribute('data-lucide', 'star');
        const isActive = i <= rating;
        star.className = `star w-6 h-6 cursor-pointer transition-all ${isActive ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'}`;
        
        star.onclick = (e) => {
            e.stopPropagation();
            userRatings[movieId] = i;
            localStorage.setItem('moviehub_ratings', JSON.stringify(userRatings));
            renderInteractiveStars(movieId);
        };
        container.appendChild(star);
    }
    lucide.createIcons();
}

function closeModal() {
    const modal = document.getElementById('movieModal');
    const player = document.getElementById('trailerPlayer');
    const videoContainer = document.getElementById('videoContainer');
    
    if (player) player.src = ""; 
    if (videoContainer) videoContainer.classList.add('hidden');

    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        const modalContent = modal.querySelector('.overflow-y-auto');
        if (modalContent) modalContent.scrollTop = 0;
    }, 300);
}

// --- FILTERING ---

function filterIndustry(ind) {
    currentFilter = ind;
    document.querySelectorAll('.industry-btn').forEach(btn => {
        const isActive = btn.innerText === ind || (btn.innerText === 'South' && ind === 'South Indian');
        btn.classList.toggle('text-indigo-400', isActive);
        btn.classList.toggle('text-gray-400', !isActive);
    });

    const container = document.getElementById('movieSections');
    const hero = document.getElementById('hero');
    container.innerHTML = '';

    if (ind === 'All') {
        if(hero) hero.style.display = 'flex';
        initializeData();
        return;
    }

    if(hero) hero.style.display = 'none';
    const movies = MOVIE_DATA.filter(m => m.industry === ind);

    const section = document.createElement('section');
    section.className = 'px-6 animate-in fade-in duration-500';
    section.innerHTML = `
        <div class="flex items-center gap-4 mb-10"><h2 class="text-4xl font-black text-white uppercase">${ind} Cinema</h2></div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            ${movies.map(movie => `
                <div class="movie-card glass rounded-2xl overflow-hidden cursor-pointer hover:scale-105 transition-all" onclick="openModal(${movie.id})">
                    <div class="relative h-72">
                        <img src="${movie.image}" class="w-full h-full object-cover">
                        <div class="absolute bottom-3 left-3"><p class="text-xs font-bold text-white truncate w-32">${movie.title}</p></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    container.appendChild(section);
    lucide.createIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- SEARCH LOGIC ---

document.getElementById('searchInput').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const container = document.getElementById('movieSections');
    const hero = document.getElementById('hero');

    if (term.length < 2) {
        if (term === '') filterIndustry('All');
        return;
    }

    hero.style.display = 'none';
    const filtered = MOVIE_DATA.filter(m => 
        m.title.toLowerCase().includes(term) || 
        m.description.toLowerCase().includes(term)
    );

    container.innerHTML = `<div class="px-6 mb-10"><h2 class="text-2xl font-black text-white">Results for "${term}"</h2></div>`;
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6 px-6';
    grid.innerHTML = filtered.map(movie => `
        <div class="movie-card glass rounded-2xl overflow-hidden cursor-pointer" onclick="openModal(${movie.id})">
            <img src="${movie.image}" class="h-72 w-full object-cover">
            <div class="p-3"><p class="text-white font-bold text-xs truncate">${movie.title}</p></div>
        </div>
    `).join('');
    container.appendChild(grid);
});


function scrollRow(id, amount) {
    const scrollAmount = window.innerWidth < 768 ? amount / 2 : amount;
    document.getElementById(id).scrollBy({ left: scrollAmount, behavior: 'smooth' });
}

// --- INIT ---
window.addEventListener('load', initializeData);

document.getElementById('closeModal').onclick = closeModal;
document.getElementById('closeVideo').onclick = () => {
    document.getElementById('videoContainer').classList.add('hidden');
    document.getElementById('trailerPlayer').src = "";
};
window.onclick = (e) => { if (e.target.id === 'movieModal') closeModal(); };
