const AWS = require("aws-sdk");
const route53 = new AWS.Route53();
const acm = new AWS.ACM();

async function registerAndSetupDomain() {
  const domainName = "example.com"; // Replace with your domain name
  const loadBalancerDNSName =
    "my-load-balancer-1234567890.us-west-2.elb.amazonaws.com"; // Replace with your Load Balancer DNS Name

  // Step 1: Register a new domain
  const domainRegistrationParams = {
    DomainName: domainName,
    DurationInYears: 1,
    IdnLangCode: "en",
    AutoRenew: true,
  };
  const domainRegistrationResponse = await route53
    .registerDomain(domainRegistrationParams)
    .promise();
  console.log("Domain registration initiated:", domainRegistrationResponse);

  // Waiting for domain registration to complete could be tricky as there's no built-in waiter for this in AWS SDK.
  // You might need to implement a custom checking mechanism that periodically checks the status of the domain.

  // Step 2: Create a hosted zone
  const hostedZoneParams = {
    CallerReference: `hz-${Date.now()}`,
    Name: domainName,
  };
  const hostedZoneResponse = await route53
    .createHostedZone(hostedZoneParams)
    .promise();
  console.log("Hosted zone created:", hostedZoneResponse);

  // Step 3: Request a SSL certificate
  const certificateParams = {
    DomainName: domainName,
    ValidationMethod: "DNS",
  };
  const certificateResponse = await acm
    .requestCertificate(certificateParams)
    .promise();
  console.log("SSL certificate requested:", certificateResponse);

  // Step 4: After the certificate is issued, associate the same with the domain
  // Waiting for SSL certificate to be issued
  await acm
    .waitFor("certificateValidated", {
      CertificateArn: certificateResponse.CertificateArn,
    })
    .promise();
  console.log("SSL certificate issued.");

  // Step 5: Point the domain to the frontend load balancer (through its A records)
  const changeResourceRecordSetsParams = {
    HostedZoneId: hostedZoneResponse.HostedZone.Id,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: domainName,
            Type: "A",
            AliasTarget: {
              DNSName: loadBalancerDNSName,
              HostedZoneId: hostedZoneResponse.HostedZone.Id,
              EvaluateTargetHealth: false,
            },
          },
        },
      ],
    },
  };
  const changeResourceRecordSetsResponse = await route53
    .changeResourceRecordSets(changeResourceRecordSetsParams)
    .promise();
  console.log("A record created:", changeResourceRecordSetsResponse);
}

registerAndSetupDomain().catch(console.error);
