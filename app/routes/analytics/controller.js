const Analytics = require('../../models/analytics');
const Campaign = require('../../models/campaign');
const response = require('../../util/response');
const password = require('../../util/password');
const mongoose = require('mongoose');

exports.summarize = function(req, res) {
    Campaign
        .find({ userID: req.query.userID })
        .select('target')
        .then((campaigns) => {
            campaigns = campaigns.map((campaign) => campaign._id);

            Analytics.find({ 'target': { $in: campaigns } })
                .then((data) => {
                    const summary = data.reduce((summary, d) => {
                        switch(d.type) {
                            case 'scan':
                            case 'share':
                            case 'sticker':
                            case 'photo':
                                summary[ `${d.type}s` ]++;
                        }
                        return summary;
                    }, { scans: 0, shares: 0, stickers: 0, photos: 0 });
                    
                    response.returnFullSchema(res)(summary);
                })
                .catch(response.returnError(res));
        })
        .catch(response.returnError(res));
}

exports.log = function(req, res) {
    let analytics = new Analytics();
    
    analytics = Object.assign(analytics, req.body);
    analytics.createdOn = Date.now();
    analytics.updatedOn = Date.now();

    if (analytics.type === 'location') {
        logLocationStat(analytics, res);
    } else {
        analytics.save()
            .then(response.returnFullSchema(res))
            .catch(response.returnError(res));
    }
}

exports.show = function(req, res) {
    const creationDatePromise = Campaign
        .findOne({ _id: req.params.target_id }, "createdOn")
        .then( result => getDaysSinceDate(result.createdOn) );

    const scansPromise = Analytics.count({ target: req.params.target_id, type: 'scan' });

    const timeSpanPromise = Analytics
        .find({ target: req.params.target_id, type: 'timeSpan' }, "timeSpan")
        .then( getTimeSpanAvg );

    const sharePromise = Analytics
        .aggregate([
            {
                $match: { 
                    type: "share",
                    target: mongoose.Types.ObjectId(req.params.target_id)
                }
            },
            { 
                $group: { 
                    _id: "$social",
                    count: { $sum: 1 }
                }
            }
        ]);

    const photoPromise = Analytics
        .count({ target: req.params.target_id, type: 'photo' });

    const stickersPromise = Analytics
        .aggregate([
            {
                $match: { 
                    type: "sticker",
                    target: mongoose.Types.ObjectId(req.params.target_id)
                }
            },
            { 
                $group: { 
                    _id: "$sticker",
                    count: { $sum: 1 }
                }
            }
        ]);

    const locationsPromise = Analytics
        .aggregate([
            {
                $match: { 
                    type: "location",
                    target: mongoose.Types.ObjectId(req.params.target_id)
                }
            },
            { 
                $group: { 
                    _id: "$location.city",
                    count: { $sum: 1 }
                }
            }
        ]);

    Promise.all([ creationDatePromise, scansPromise, timeSpanPromise, sharePromise, photoPromise, stickersPromise, locationsPromise ])
        .then((data) => {
            const facebook = data[3].filter( obj => obj._id === 'facebook' );
            const facebookCount = ( facebook.length > 0 ) ? facebook[0].count : 0;

            const twitter = data[3].filter( obj => obj._id === 'twitter' );
            const twitterCount = ( twitter.length > 0 ) ? twitter[0].count : 0;

            response.returnFullSchema(res)({
                activeDays: data[0],
                scans: data[1],
                timeSpan: data[2],
                shares: {
                    facebook: facebookCount,
                    twitter: twitterCount
                },
                photos: data[4],
                stickers: data[5].sort( (a, b) => (a.count > b.count) ? -1 : 1 ), // Desc order
                locations: data[6].sort( (a, b) => (a.count > b.count) ? -1 : 1 ) // Desc order
            });
        })
        .catch(response.returnError(res));
}

function logLocationStat(analytics, res) {
    const googleMapsClient = require('@google/maps').createClient({
        key: 'AIzaSyDbeL1GJc_VzOD8fMKNOgf5mpG8UxCKL58'
    });

    googleMapsClient.reverseGeocode({
        latlng: { lat: analytics.location.latitude , lng: analytics.location.longitude }
    }, function(err, mapsResponse) {
        if (err) {
            response.returnError(res)(err);  
        }
        if (mapsResponse.status === 200) {
            const city = getCity(mapsResponse);
            analytics.location.city = city;
                analytics.save()
                    .then(response.returnFullSchema(res))
                    .catch(response.returnError(res));
        }

    });
}

function getCity(mapsResponse) {
    let city;
    let state;
    for (let i = 0; i < mapsResponse.json.results.length; i++) {
        if ((!city || !state) && mapsResponse.json.results[i].types[0] === "locality") {
            city = mapsResponse.json.results[i].address_components[0].short_name;
            //state = mapsResponse.json.results[i].address_components[2].short_name;
            return city
        }
    }
}

function getDaysSinceDate(date) {
    const difference = Date.now() - date;
    return Math.round( difference /  (1000 * 3600 * 24) ); // In days
}

function getTimeSpanAvg(data) {
    if (data.length === 0) {
        return '00:00';
    }
    const timeSpanArray = data.map((statObj) => statObj.timeSpan.end - statObj.timeSpan.start);
    const timeSpanSum = timeSpanArray.reduce((last, current) => last + current);
    const timeSpanAvg = timeSpanSum / timeSpanArray.length;
    let min = Math.round(timeSpanAvg / (1000 * 60) );
    let sec = Math.round( (timeSpanAvg / 1000) % 60);
    min = ( min < 10 ) ? "0" + `${min}` : min;
    sec = ( sec < 10 ) ? "0" + `${sec}` : sec;

    return `${min}:${sec}`;
}