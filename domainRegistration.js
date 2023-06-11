// Load the AWS SDK for Node.js
var AWS = require("aws-sdk");
// Set the region
AWS.config.update({ region: "us-east-1" });

// Create Route53 and Route53Domains service objects
var route53domains = new AWS.Route53Domains();

// First, check if the domain is available
const checkAvailablityAndRegisterDomain = function (domainName) {
  route53domains.checkDomainAvailability(
    { DomainName: domainName },
    function (err, data) {
      if (err) console.log(err, err.stack); // an error occurred
      else {
        console.log("data is", data);
        if (data.Availability == "AVAILABLE") {
          // The domain is available, register it
          var params = {
            DomainName: domainName,
            DurationInYears: 1,
            AdminContact: {
              AddressLine1: "123 Anywhere St.",
              City: "Seattle",
              ContactType: "PERSON",
              CountryCode: "US",
              Email: "admin@example.com",
              FirstName: "John",
              LastName: "Doe",
              State: "WA",
              PhoneNumber: "+1.1234567890", // Include a valid phone number
              ZipCode: "90210",
            },
            RegistrantContact: {
              AddressLine1: "123 Anywhere St.",
              City: "Seattle",
              ContactType: "PERSON",
              CountryCode: "US",
              Email: "admin@example.com",
              FirstName: "John",
              LastName: "Doe",
              State: "WA",
              PhoneNumber: "+1.9876543210", // Include a valid phone number
              ZipCode: "10001",
            },
            TechContact: {
              AddressLine1: "123 Anywhere St.",
              City: "Seattle",
              ContactType: "PERSON",
              CountryCode: "US",
              Email: "admin@example.com",
              FirstName: "John",
              LastName: "Doe",
              State: "WA",
              PhoneNumber: "+1.1122334455", // Include a valid phone number
              ZipCode: "60606",
            },

            AutoRenew: true,
          };
          route53domains.registerDomain(params, function (err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else {
              // Domain registration request has been sent, now wait for it to complete
              var operationId = data.OperationId; // Get the operation ID from the response data

              function checkDomainStatus() {
                var params = {
                  OperationId: operationId, // Use the operation ID here
                };
                route53domains.getOperationDetail(params, function (err, data) {
                  if (err) {
                    console.log(err, err.stack); // an error occurred
                  } else {
                    // Check the operation status
                    if (data.Status == "IN_PROGRESS") {
                      console.log("Domain registration in progress");
                    } else if (data.Status == "SUCCESSFUL") {
                      console.log("Domain registration completed");
                    } else {
                      console.log("Domain registration status: " + data.Status);
                    }
                    // If the operation is not yet successful, wait for some time and try again
                    setTimeout(checkDomainStatus, 5000); // wait for 5 seconds
                  }
                });
              }

              // Wait for some time before starting to check the domain status
              setTimeout(checkDomainStatus, 30000); // wait for 30 seconds
            }
          });
        } else {
          console.log("Domain is not available");
        }
      }
    }
  );
};

module.exports = checkAvailablityAndRegisterDomain;
