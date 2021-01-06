const DatabaseConnection = require("../../source/DatabaseConnection");
const SubscriptionController = require("../../source/routes/SubscriptionController");
const mongoose = require("mongoose");
const utils = require("../utils");
const request = require("supertest");

describe("SubscriptionController", () => {

    const testURL = "/subscription";
    const db = new DatabaseConnection();
    let app, controller;

    // Preload data
    let preload;
    const preloadEntries = 5;
    const sampleProduct = {
        _id: mongoose.Types.ObjectId(1).toHexString(),
        quantity: 5,
        unitPriceEuros: 20
    };

    beforeAll(() => {

        // Create controller
        controller = new SubscriptionController(testURL, utils.mockedRouter());
        app = utils.createExpressApp(controller, testURL);

        // Create database preload for some tests
        preload = [];
        for (let i = 0; i < preloadEntries; i++) {
            preload.push({
                userID: mongoose.Types.ObjectId(i).toHexString(),
                timestamp: new Date().toISOString(),
                paypal_subscription_id: "TESTESTESTESTEST",
                products: [sampleProduct]
            });
        }

        return db.setup();
    });

    beforeEach(done => mongoose.connection.dropCollection("subscriptionentries", err => done()));

    afterAll(() => db.close());

    test("Write & read single entry", () => {

        const userID = mongoose.Types.ObjectId(1).toHexString();
        const now = new Date().toISOString();

        // Expected result from GET request
        const expectedResult = {
            timestamp: now,
            price: 19.40,
            is_active: true,
            paypal_subscription_id: "TESTESTESTESTEST",
            products: [sampleProduct]
        };

        // Entry to be added
        const testEntry = {
            userID: userID,
            timestamp: now,
            operationType: expectedResult.operationType,
            products: expectedResult.products
        };

        // Create a new subscription entry
        return controller.createEntry(testEntry)
            .then(() => {
                return request(app)
                    .get(testURL)
                    .query({
                        userID: userID,
                        beforeTimestamp: new Date(),
                        pageSize: 5
                    })
                    .expect(200);
            })
            .then(response => {
                const data = response.body;

                expect(data.length).toBe(1);
                expect(data[0].timestamp).toStrictEqual(expectedResult.timestamp);
                expect(data[0].operationType).toBe(expectedResult.operationType);
                expect(data[0].products).toMatchObject(expectedResult.products);
                expect(data[0].userID).toBeUndefined();
            })
    });

    test("Should return empty set", () => {

        return request(app)
            .get(testURL)
            .query({
                userID: mongoose.Types.ObjectId().toHexString(),
                beforeTimestamp: new Date(),
                pageSize: 10
            })
            .expect(200, []);
    });

    test("Missing user", () => {

        // Preload database
        return controller.createEntries(preload)
            .then(() => {
                return request(app)
                    .get(testURL)
                    .query({
                        userID: mongoose.Types.ObjectId(preloadEntries + 1).toHexString(),
                        beforeTimestamp: new Date(),
                        pageSize: 10
                    })
                    .expect(200, []);
            });
    });

    test("Multiple entries & selection by date and user", () => {

        const thresholdDate = Date.now();

        // Preload database
        return controller.createEntries(preload)
            .then(() => {

                // Additional entry for user with entries
                return controller.createEntry({
                    userID: preload[0].userID,
                    timestamp: new Date(thresholdDate + 100),
                    price: 19.40,
                    is_active: true,
                    paypal_subscription_id: "TESTESTESTESTEST",
                    products: [sampleProduct]
                })
            })
            .then(() => {
                return request(app)
                    .get(testURL)
                    .query({
                        userID: preload[0].userID,
                        beforeTimestamp: thresholdDate,
                        pageSize: 10
                    })
                    .expect(200);
            })
            .then(response => {
                const data = response.body;
                expect(data.length).toBe(1); // Should return the entry before thresholdDate
                expect(data[0].timestamp).toStrictEqual(preload[0].timestamp);
                expect(data[0].is_active).toBe(preload[0].is_active);
                expect(data[0].price).toBe(preload[0].price);
                expect(data[0].paypal_subscription_id).toBe(preload[0].paypal_subscription_id);
                expect(data[0].products).toMatchObject(preload[0].products);
            });
    });

    test("Page size limits", () => {

        let modPreload = preload;
        const userID = mongoose.Types.ObjectId(100).toHexString();
        const pageSize = 3;
        for (let i = 0; i < preloadEntries; i++) {
            modPreload[i].userID = userID;
        }

        return controller.createEntries(modPreload)
            .then(() => {
                return request(app)
                    .get(testURL)
                    .query({
                        userID: userID,
                        beforeTimestamp: new Date(),
                        pageSize: pageSize
                    })
                    .expect(200);
            })
            .then(response => {
                expect(response.body.length).toBe(pageSize);
            })
    });
});