const AWS = require("aws-sdk");
const mysql = require("mysql");

const route53domains = new AWS.Route53Domains({ region: "REGION" });

const connection = mysql.createConnection({
  host: "HOSTNAME",
  user: "USERNAME",
  password: "PASSWORD",
  database: "DATABASE_NAME",
});

exports.handler = async (event, context) => {
  // Extract domain name from the request body
  const domainName = JSON.parse(event.body).domainName;

  const params = {
    DomainName: domainName,
  };

  const checkDomainAvailabilityCommand =
    new AWS.Route53Domains.CheckDomainAvailabilityCommand(params);

  try {
    // Check if domain is available in our 'available_domains' table
    let sql = "SELECT * FROM available_domains WHERE name = ?";
    let [rows] = await connection.query(sql, [domainName]);

    if (rows.length > 0) {
      return {
        statusCode: 200,
        already_available: true,
        body: `Domain ${domainName} is already available in our records.`,
      };
    }

    // If domain is not in our 'available_domains' table, check its availability with AWS Route53
    let data = await route53domains.send(checkDomainAvailabilityCommand);
    if (data.Availability === "AVAILABLE") {
      // Insert domain into 'domains' table
      sql = `INSERT INTO domains (name) VALUES (?)`;
      await connection.query(sql, [domainName]);

      return {
        statusCode: 200,
        already_available: false,
        body: `Domain ${domainName} has been inserted into the database.`,
      };
    } else {
      return {
        statusCode: 400,
        body: `Domain ${domainName} is not available.`,
      };
    }
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: "An error occurred while processing your request.",
    };
  } finally {
    // Close the database connection
    if (connection && connection.end) connection.end();
  }
};
