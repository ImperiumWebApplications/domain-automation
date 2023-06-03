const mysql = require("mysql");
const cron = require("node-cron");
const AWS = require("aws-sdk");
const util = require("util");

AWS.config.update({
  accessKeyId: "{AWS_ACCESS_KEY_ID}",
  secretAccessKey: "{AWS_SECRET_ACCESS_KEY}",
  region: "us-east-1", // Change this to your AWS region
});

const route53 = new AWS.Route53();
const route53domains = new AWS.Route53Domains();
const acm = new AWS.ACM();

const connection = mysql.createConnection({
  host: "{RDS_HOST}",
  user: "{RDS_USER}",
  password: "{RDS_PASSWORD}",
  database: "{RDS_DATABASE}",
});

connection.connect((err) => {
  if (err) throw err;
  console.log("Connected to MySQL database.");
});

// Promisify the query function
connection.query = util.promisify(connection.query);

async function processDomain(domainName) {
  const params = {
    DomainName: domainName,
    DurationInYears: 1, // Change this to your desired duration
    AdminContact: {
      /* Your contact details */
    },
    RegistrantContact: {
      /* Your contact details */
    },
    TechContact: {
      /* Your contact details */
    },
    AutoRenew: true,
    IdnLangCode: "eng",
    PrivacyProtectAdminContact: true,
    PrivacyProtectRegistrantContact: true,
    PrivacyProtectTechContact: true,
  };

  try {
    const registerResponse = await route53domains
      .registerDomain(params)
      .promise();
    console.log(
      `Registered domain ${domainName}: ${registerResponse.OperationId}`
    );

    await connection.query("DELETE FROM domain WHERE name = ?", [domainName]);
    console.log(`Deleted domain ${domainName} from domain table.`);

    await connection.query("INSERT INTO available_domains (name) VALUES (?)", [
      domainName,
    ]);
    console.log(`Inserted domain ${domainName} into available_domains table.`);

    const hostedZoneResponse = await route53
      .createHostedZone({
        Name: domainName,
        CallerReference: `${Date.now()}`, // unique string used to identify this request
      })
      .promise();
    console.log(`Created hosted zone for domain ${domainName}.`);
    const hostedZoneId = hostedZoneResponse.HostedZone.Id;

    const changeRecordResponse = await route53
      .changeResourceRecordSets({
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: domainName,
                Type: "A",
                TTL: 300, // time to live in seconds
                ResourceRecords: [
                  {
                    Value: "{frontend_load_balancer_IP}", // replace with your load balancer's IP
                  },
                ],
              },
            },
          ],
        },
      })
      .promise();
    console.log(`Created A record for domain ${domainName}.`);

    const certificateResponse = await acm
      .requestCertificate({
        DomainName: domainName,
        ValidationMethod: "DNS",
      })
      .promise();
    console.log(
      `Requested SSL certificate for domain ${domainName}. Certificate ARN: ${certificateResponse.CertificateArn}`
    );
    const certificateArn = certificateResponse.CertificateArn;

    const certificateDescription = await acm
      .describeCertificate({
        CertificateArn: certificateArn,
      })
      .promise();
    const record =
      certificateDescription.Certificate.DomainValidationOptions[0]
        .ResourceRecord;

    const changeDnsResponse = await route53
      .changeResourceRecordSets({
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: record.Name,
                Type: record.Type,
                TTL: 300, // time to live in seconds
                ResourceRecords: [
                  {
                    Value: record.Value,
                  },
                ],
              },
            },
          ],
        },
      })
      .promise();
    console.log(`Created DNS validation record for domain ${domainName}.`);

    const validationData = await acm
      .waitFor("certificateValidated", {
        CertificateArn: certificateArn,
      })
      .promise();
    console.log(`Validated SSL certificate for domain ${domainName}.`);
  } catch (err) {
    console.log(`Failed to process domain ${domainName}: ${err}`);
  }
}

cron.schedule("* * * * *", async () => {
  const results = await connection.query("SELECT name FROM domain");
  for (const row of results) {
    processDomain(row.name);
  }
});
