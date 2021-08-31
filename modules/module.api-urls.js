// api domains
const domain = {
    www:      'https://www.crunchyroll.com',
    api:      'https://api.crunchyroll.com',
    www_beta: 'https://beta.crunchyroll.com',
    api_beta: 'https://beta-api.crunchyroll.com',
};

// api urls
const api = {
    // web
    search1:        `${domain.www}/ajax/?req=RpcApiSearch_GetSearchCandidates`,
    search2:        `${domain.www}/search_page`,
    rss_cid:        `${domain.www}/syndication/feed?type=episodes&id=`, // &lang=enUS
    rss_gid:        `${domain.www}/syndication/feed?type=episodes&group_id=`, // &lang=enUS
    media_page:     `${domain.www}/media-`,
    series_page:    `${domain.www}/series-`,
    auth:           `${domain.www}/login`,
    // mobile api
    search3:        `${domain.api}/autocomplete.0.json`,
    session:        `${domain.api}/start_session.0.json`,
    collections:    `${domain.api}/list_collections.0.json`,
    // beta api
    beta_auth:      `${domain.api_beta}/auth/v1/token`,
    beta_authBasic: 'Basic bm9haWhkZXZtXzZpeWcwYThsMHE6',
    beta_profile:   `${domain.api_beta}/accounts/v1/me/profile`,
};

// set header
api.beta_authHeader = { 
    Authorization: api.beta_authBasic
};

module.exports = {
    domain,
    api,
};
