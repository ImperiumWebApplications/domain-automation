// Load the AWS SDK for Node.js
var AWS = require("aws-sdk");

// AWS service objects
const route53domains = new AWS.Route53Domains({ region: "us-east-1" });
const route53 = new AWS.Route53({ region: "us-east-1" });
const ACM = new AWS.ACM({ region: "eu-central-1" });
const ELBv2 = new AWS.ELBv2({ region: "eu-central-1" });

// First, check if the domain is available
const checkAvailablityAndRegisterDomain = function (domainName) {
  return new Promise((resolve, reject) => {
    route53domains.checkDomainAvailability(
      { DomainName: domainName },
      function (err, data) {
        if (err) reject(err); // an error occurred
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
                PhoneNumber: "+1.1234567890",
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
                PhoneNumber: "+1.9876543210",
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
                PhoneNumber: "+1.1122334455",
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
                  route53domains.getOperationDetail(
                    params,
                    function (err, data) {
                      if (err) {
                        reject(err); // an error occurred
                      } else {
                        // Check the operation status
                        if (data.Status == "IN_PROGRESS") {
                          console.log("Domain registration in progress");
                          // If the operation is not yet successful, wait for some time and try again
                          setTimeout(checkDomainStatus, 5000); // wait for 5 seconds
                        } else if (data.Status == "SUCCESSFUL") {
                          console.log("Domain registration completed");
                          resolve();
                        } else {
                          console.log(
                            "Domain registration status: " + data.Status
                          );
                          // If the operation is not yet successful, wait for some time and try again
                          setTimeout(checkDomainStatus, 5000); // wait for 5 seconds
                        }
                      }
                    }
                  );
                }

                // Wait for some time before starting to check the domain status
                setTimeout(checkDomainStatus, 60000); // wait for 60 seconds
              }
            });
          } else {
            console.log("Domain is not available");
            reject("Domain is not available");
          }
        }
      }
    );
  });
};
const configureARecord = function (domainName, loadBalancerDNSName) {
  return new Promise((resolve, reject) => {
    route53.listHostedZonesByName(
      {
        DNSName: domainName,
        MaxItems: "1",
      },
      function (err, data) {
        if (err) reject(err); // an error occurred
        else {
          if (
            data.HostedZones.length > 0 &&
            data.HostedZones[0].Name === domainName + "."
          ) {
            var hostedZoneId = data.HostedZones[0].Id;

            // change A record to point to load balancer
            var params = {
              ChangeBatch: {
                Changes: [
                  {
                    Action: "UPSERT",
                    ResourceRecordSet: {
                      Name: domainName,
                      Type: "A",
                      AliasTarget: {
                        DNSName: loadBalancerDNSName,
                        EvaluateTargetHealth: false,
                        HostedZoneId: "Z215JYRZR1TBD5",
                      },
                    },
                  },
                ],
                Comment: "update A record to point to load balancer",
              },
              HostedZoneId: hostedZoneId,
            };
            route53.changeResourceRecordSets(params, function (err, data) {
              if (err) reject(err); // an error occurred
              else resolve(data); // successful response
            });
          } else {
            console.log("Inside configureARecord method");
            console.log("No hosted zone found for domain: " + domainName);
            reject("No hosted zone found for domain: " + domainName);
          }
        }
      }
    );
  });
};

const requestAndAssociateCertificate = function (domainName, loadBalancerArn) {
  return new Promise((resolve, reject) => {
    const idempotencyToken = `idempotency_${Date.now()}`;
    ACM.requestCertificate(
      {
        DomainName: domainName,
        ValidationMethod: "DNS",
        IdempotencyToken: idempotencyToken, // a unique token to prevent duplicate requests
      },
      function (err, data) {
        if (err) reject(err); // an error occurred
        else {
          const certificateArn = data.CertificateArn;
          console.log("Certificate requested, ARN: " + certificateArn);
          setTimeout(function () {
            associateCertificateWithLoadBalancer(
              certificateArn,
              loadBalancerArn
            );
          }, 60000);
          resolve();
        }
      }
    );
  });
};

function associateCertificateWithLoadBalancer(certificateArn, loadBalancerArn) {
  ELBv2.describeListeners(
    {
      LoadBalancerArn: loadBalancerArn,
    },
    function (err, data) {
      if (err) console.log(err, err.stack); // an error occurred
      else {
        const listenerArn = data.Listeners.find(
          (listener) => listener.Port === 443
        ).ListenerArn;

        ELBv2.addListenerCertificates(
          {
            Certificates: [{ CertificateArn: certificateArn }],
            ListenerArn: listenerArn,
          },
          function (err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else console.log("Certificate associated with load balancer");
          }
        );
      }
    }
  );
}

module.exports = {
  checkAvailablityAndRegisterDomain,
  configureARecord,
  requestAndAssociateCertificate,
};
