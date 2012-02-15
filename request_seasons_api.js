var _aryGeoDiff = [];
var _objLatestData = {};
var _objWay = {};

// スタート
getGeoDiff();

/**
 * 移動情報を取る
 */
function getGeoDiff() {
    var mongoose = require('mongoose');

    // 定義フェーズ
    var Schema   = mongoose.Schema;
    var Hd8Schema = new Schema({
        name:  String,
        lat: String,
        lon: String,
        timestamp: Number,
    });
    mongoose.model('Hd8', Hd8Schema);

    // 使用フェーズ
    mongoose.connect('mongodb://localhost/hd8');

    var Hd8 = mongoose.model('Hd8');

    var aryGeoDiff = [];
    var base = {};

    // 最終の位置情報と、それ以前の位置情報の差分取得
    Hd8.find({name: 'yukondou'}, [], {sort: {timestamp: -1}}, function(err, docs) {

        // 位置情報が2カ所以上あれば、ひとまず計算処理開始
        if (docs.length > 1) {
            base = docs[0];
            var base_lat = base.lat + 0;
            var base_lon = base.lon + 0;

            for (var i = 1; i < docs.length; i++) {
                // 時間差分（分）
                var dt = Math.abs((docs[i].timestamp - base.timestamp) / 60000);

                // 送信時間に1分以上の差があれば、移動情報を計算
                if (dt >= 1) {
                    var lat = Number(docs[i].lat);
                    var lon = Number(docs[i].lon);

                    var d = (distance(lat, lon, base_lat, base_lon) / 1000).toFixed(1);
                    var t = dt / 60;
                    var a = azimuth(lat, lon, base_lat, base_lon).toFixed(1);

                    aryGeoDiff.push({
                        d: d,
                        t: t,
                        t_min: dt,
                        a: a,
                    });
                }

                // 1時間以上の差があれば、終了
                if (dt > 60) {
                    break;
                }
            }
        }

        // 移動手段
        var objWay = {};
        var iLen = aryGeoDiff.length;
        if (iLen > 0) {
            var s = aryGeoDiff[iLen - 1].d / aryGeoDiff[iLen - 1].t;

            if (s < 1) {
                objWay = {
                    id: 0,
                    text: '移動してないんじゃない？',
                };
            } else if (1 <= s && s < 10) {
                objWay = {
                    id: 1,
                    text: '徒歩とか？',
                };
            } else if (10 <= s && s < 25) {
                objWay = {
                    id: 2,
                    text: '自転車とか？',
                };
            } else if (25 <= s && s < 35) {
                objWay = {
                    id: 3,
                    text: '地下鉄とか？',
                };
            } else if (35 <= s && s < 55) {
                objWay = {
                    id: 4,
                    text: '車とか？',
                };
            } else if (55 <= s && s < 70) {
                objWay = {
                    id: 5,
                    text: '電車とか？',
                };
            } else if (70 <= s && s < 100) {
                objWay = {
                    id: 6,
                    text: '高速道路とか？',
                };
            } else if (100 <= s) {
                objWay = {
                    id: 7,
                    text: 'ぶっとんでるね！',
                };
            }
        }

        // グローバル変数に入れて
        _objLatestData = base;
        _aryGeoDiff = aryGeoDiff;
        _objWay = objWay;

        // 検索へ
        getNearlyStation();
    });
}

/**
 * 最寄駅＆最寄路線検索
 */
function getNearlyStation() {

    var sAppid = 'cV8qsbmxg67L0Z7MV1B7vtwGTL5uf2wHPQhZPkam8Wfjp_.7SpgzAEn9cID00NXUcpqY';

    var fLat = _objLatestData.lat - 0;
    var fLon = _objLatestData.lon - 0;
    var sQuery = '駅';
    var sGc = '0306006'
    var iDistance = 1;

    var sApiQuery = ''
        + '?appid='    + sAppid
        + '&lat='      + fLat
        + '&lon='      + fLon
        + '&query='    + sQuery
        + '&gc='       + sGc
        + '&distance=' + iDistance
        + '&output=json'
        + '&sort=dist'
    ;

    var http = require('http');

    http.get(
        {
            host: 'search.olp.yahooapis.jp',
            path: '/OpenLocalPlatform/V1/localSearch' + sApiQuery,
        },
        function(res) {
            var body = '';
            res.on('data', function(data) {
                body += data;
            });
            res.on('end', function() {
                var a = JSON.parse(body);

                var aryNearlyLine = {};

                for (var i = 0; i < a.Feature.length; i++) {
                    objProperty = a.Feature[i].Property;

                    for (var j in objProperty.Station) {
                        var aryLine = objProperty.Station[j].Railway.split('/');

                        // 最寄路線
                        for (var j in aryLine) {
                            if (aryNearlyLine[aryLine[j]] === undefined) {
                                aryNearlyLine[aryLine[j]] = 1;
                            } else {
                                aryNearlyLine[aryLine[j]]++;
                            }
                        }
                    }
                }

//                console.log('最寄路線');
//                console.log(aryNearlyLine);

                // 最寄路線上の駅を探す
                getFarStation(aryNearlyLine);
            });
        }
    );
}


/**
 * 最寄路線上の駅検索
 * Local Search
 *
 * 電車の平均速度（表定速度）を60km/h、移動時間を10分とし、
 * 初期地点から10km以内の駅を探す
 */
function getFarStation(aryNearlyLine) {

    var sAppid = 'cV8qsbmxg67L0Z7MV1B7vtwGTL5uf2wHPQhZPkam8Wfjp_.7SpgzAEn9cID00NXUcpqY';

    var fLat = _objLatestData.lat - 0;
    var fLon = _objLatestData.lon - 0;
    var sQuery = '駅';
    var sGc = '0306006'
    var iDistance = 10;

    var sApiQuery = ''
        + '?appid='    + sAppid
        + '&lat='      + fLat
        + '&lon='      + fLon
        + '&query='    + sQuery
        + '&gc='       + sGc
        + '&distance=' + iDistance
        + '&output=json'
        + '&sort=dist'
    ;

    var http = require('http');

    var iAvgAngle = 0;
    for (var i = 0; i < _aryGeoDiff.length; i++) {
        iAvgAngle += (_aryGeoDiff[i].a - 0);
    }
    iAvgAngle /= _aryGeoDiff.length;

    http.get(
        {
            host: 'search.olp.yahooapis.jp',
            path: '/OpenLocalPlatform/V1/localSearch' + sApiQuery,
        },
        function(res) {
            var body = '';
            res.on('data', function(data) {
                body += data;
            });
            res.on('end', function() {
                var a = JSON.parse(body);

                var aryFarStation = [];

                // 10km以内の駅の路線名確認
                for (var i = 0; i < a.Feature.length; i++) {
                    objProperty = a.Feature[i].Property;

                    // 最寄駅と同じ路線にあればOK
 
                    for (var j in objProperty.Station) {
                        var aryFarLine = objProperty.Station[j].Railway.split('/');

                        for (var k = 0; k < aryFarLine.length; k++) {
                            if (aryNearlyLine[aryFarLine[k]] !== undefined) {
                                bOnLine = true;
                                break;
                            }
                        }
                        if (bOnLine) {
                            var aryCoord = a.Feature[i].Geometry.Coordinates.split(',');

                            var fAngle = azimuth(aryCoord[1], aryCoord[0], fLat, fLon);
                            var fDiffAngle = Math.abs(fAngle - iAvgAngle);

                            if (fDiffAngle <= 90) {
                                aryFarStation.push(a.Feature[i]);
                            }
                            break;
                        }
                    }
                }

//                console.log(aryFarStation);

                response(aryFarStation);
            });
        }
    );
}

/**
 * 検索位置を返すHTTP API
 */
function response(aryFarStation) {
    var http = require('http');
    var server = http.createServer(
        function (request, response) {
            response.writeHead(200, {'Content-Type': 'text/javascript; charset=UTF-8'});
            response.write(JSON.stringify({
                current: _objLatestData,
                way: _objWay,
                diff: _aryGeoDiff,
                station: aryFarStation,
            }));
            response.end();
        }
    ).listen(8124);
    console.log('Server running at http://127.0.0.1:8124/');
}





var A = 6378137;            // 地球の赤道半径
var RAD = Math.PI / 180;    // 1°あたりのラジアン

/**
 * 2点間の距離を求める関数
 */
function distance(lat1, lon1, lat2, lon2) {
    // 度をラジアンに変換
    lat1 *= RAD;
    lon1 *= RAD;
    lat2 *= RAD;
    lon2 *= RAD;
    var lat_c = (lat1 + lat2) / 2;                  // 緯度の中心値
    var dx = A * (lon2 - lon1) * Math.cos(lat_c);
    var dy = A * (lat2 - lat1);

    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 2点間の方位角を求める関数
 */
function azimuth(lat1, lon1, lat2, lon2) {
    // 度をラジアンに変換
    lat1 *= RAD;
    lon1 *= RAD;
    lat2 *= RAD;
    lon2 *= RAD;

    var lat_c = (lat1 + lat2) / 2;                  // 緯度の中心値
    var dx = A * (lon2 - lon1) * Math.cos(lat_c);
    var dy = A * (lat2 - lat1);

    if (dx == 0 && dy == 0) {
        return 0;   // dx, dyともに0のときは強制的に0とする。
    }
    else {
        return Math.atan2(dy, dx) / RAD;    // 結果は度単位で返す
    }
}


